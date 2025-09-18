from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from models import db, User, ApiKey, ApiUsage, SearchHistory
from datetime import datetime, timedelta
import hashlib
import secrets
import json
from functools import wraps
import requests
from urllib.parse import quote_plus

api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Rate limiter
limiter = Limiter(
    app=None,
    key_func=get_remote_address,
    default_limits=["1000 per day", "100 per hour"]
)

def require_api_key(f):
    """API anahtarı gerektiren decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
        
        if not api_key:
            return jsonify({
                'error': 'API anahtarı gereklidir',
                'code': 'MISSING_API_KEY'
            }), 401
        
        # API anahtarını doğrula
        api_key_obj = ApiKey.query.filter_by(key_hash=hashlib.sha256(api_key.encode()).hexdigest()).first()
        
        if not api_key_obj or not api_key_obj.is_active:
            return jsonify({
                'error': 'Geçersiz API anahtarı',
                'code': 'INVALID_API_KEY'
            }), 401
        
        # Kullanıcı abonelik kontrolü
        user = api_key_obj.user
        if not user.subscription or not user.subscription.is_active():
            return jsonify({
                'error': 'Aktif abonelik gereklidir',
                'code': 'SUBSCRIPTION_REQUIRED'
            }), 403
        
        # API kullanım limitini kontrol et
        if not check_api_usage_limit(user):
            return jsonify({
                'error': 'API kullanım limitiniz dolmuştur',
                'code': 'USAGE_LIMIT_EXCEEDED'
            }), 429
        
        # API kullanımını kaydet
        record_api_usage(api_key_obj, request.endpoint)
        
        # Request'e kullanıcı bilgisini ekle
        request.current_user = user
        request.api_key = api_key_obj
        
        return f(*args, **kwargs)
    
    return decorated_function

def check_api_usage_limit(user):
    """API kullanım limitini kontrol et"""
    if not user.subscription:
        return False
    
    # Bu ay yapılan API çağrılarını say
    start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    monthly_usage = ApiUsage.query.filter(
        ApiUsage.user_id == user.id,
        ApiUsage.created_at >= start_of_month
    ).count()
    
    plan_limit = user.subscription.plan.monthly_search_limit
    
    return monthly_usage < plan_limit

def record_api_usage(api_key, endpoint):
    """API kullanımını kaydet"""
    usage = ApiUsage(
        user_id=api_key.user_id,
        api_key_id=api_key.id,
        endpoint=endpoint,
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent', '')
    )
    
    db.session.add(usage)
    db.session.commit()

@api_bp.route('/search', methods=['POST'])
@require_api_key
@limiter.limit("60 per minute")
def api_search():
    """API arama endpoint'i"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'JSON verisi gereklidir',
                'code': 'INVALID_JSON'
            }), 400
        
        # Gerekli parametreleri kontrol et
        query = data.get('query', '').strip()
        if not query:
            return jsonify({
                'error': 'Arama sorgusu gereklidir',
                'code': 'MISSING_QUERY'
            }), 400
        
        # Opsiyonel parametreler
        location = data.get('location', 'Turkey')
        language = data.get('language', 'tr')
        num_results = min(data.get('num_results', 10), request.current_user.subscription.plan.max_results_per_search)
        include_snippets = data.get('include_snippets', True)
        
        # Arama yap
        search_results = perform_search(
            query=query,
            location=location,
            language=language,
            num_results=num_results,
            include_snippets=include_snippets
        )
        
        # Arama geçmişine kaydet
        search_history = SearchHistory(
            user_id=request.current_user.id,
            query=query,
            location=location,
            language=language,
            num_results=len(search_results.get('results', [])),
            via_api=True
        )
        
        db.session.add(search_history)
        db.session.commit()
        
        # Yanıt formatı
        response = {
            'success': True,
            'query': query,
            'location': location,
            'language': language,
            'total_results': len(search_results.get('results', [])),
            'results': search_results.get('results', []),
            'search_id': search_history.id,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if search_results.get('error'):
            response['warning'] = search_results['error']
        
        return jsonify(response)
        
    except Exception as e:
        current_app.logger.error(f'API search error: {e}')
        return jsonify({
            'error': 'Arama işlemi sırasında hata oluştu',
            'code': 'SEARCH_ERROR'
        }), 500

def perform_search(query, location, language, num_results, include_snippets):
    """Arama işlemini gerçekleştir"""
    results = []
    error_message = None
    
    try:
        # SERP API ile arama
        if current_app.config.get('SERP_API_KEY'):
            serp_results = search_with_serp_api(query, location, language, num_results)
            if serp_results:
                results.extend(serp_results)
        
        # Yeterli sonuç yoksa yedek arama
        if len(results) < num_results:
            backup_results = search_with_backup_method(query, num_results - len(results))
            if backup_results:
                results.extend(backup_results)
        
        # Sonuçları formatla
        formatted_results = []
        for i, result in enumerate(results[:num_results]):
            formatted_result = {
                'rank': i + 1,
                'title': result.get('title', ''),
                'url': result.get('url', ''),
                'domain': result.get('domain', ''),
                'description': result.get('description', '') if include_snippets else None
            }
            
            # Ek bilgiler varsa ekle
            if result.get('phone'):
                formatted_result['phone'] = result['phone']
            if result.get('address'):
                formatted_result['address'] = result['address']
            if result.get('rating'):
                formatted_result['rating'] = result['rating']
            
            formatted_results.append(formatted_result)
        
        return {
            'results': formatted_results,
            'error': error_message
        }
        
    except Exception as e:
        current_app.logger.error(f'Search execution error: {e}')
        return {
            'results': [],
            'error': 'Arama sırasında teknik bir hata oluştu'
        }

def search_with_serp_api(query, location, language, num_results):
    """SERP API ile arama"""
    try:
        api_key = current_app.config.get('SERP_API_KEY')
        if not api_key:
            return None
        
        params = {
            'api_key': api_key,
            'q': query,
            'location': location,
            'hl': language,
            'gl': 'tr',
            'num': num_results,
            'device': 'desktop'
        }
        
        response = requests.get('https://serpapi.com/search', params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            results = []
            
            # Organik sonuçlar
            for item in data.get('organic_results', []):
                results.append({
                    'title': item.get('title', ''),
                    'url': item.get('link', ''),
                    'domain': item.get('displayed_link', ''),
                    'description': item.get('snippet', '')
                })
            
            # Yerel işletme sonuçları
            for item in data.get('local_results', []):
                result = {
                    'title': item.get('title', ''),
                    'url': item.get('link', ''),
                    'domain': 'Local Business',
                    'description': item.get('snippet', '')
                }
                
                if item.get('phone'):
                    result['phone'] = item['phone']
                if item.get('address'):
                    result['address'] = item['address']
                if item.get('rating'):
                    result['rating'] = item['rating']
                
                results.append(result)
            
            return results
        
    except Exception as e:
        current_app.logger.error(f'SERP API error: {e}')
    
    return None

def search_with_backup_method(query, num_results):
    """Yedek arama yöntemi"""
    try:
        # DuckDuckGo Instant Answer API
        encoded_query = quote_plus(query)
        url = f'https://api.duckduckgo.com/?q={encoded_query}&format=json&no_html=1&skip_disambig=1'
        
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            results = []
            
            # Abstract sonucu
            if data.get('Abstract'):
                results.append({
                    'title': data.get('AbstractText', query),
                    'url': data.get('AbstractURL', ''),
                    'domain': data.get('AbstractSource', 'DuckDuckGo'),
                    'description': data.get('Abstract', '')
                })
            
            # İlgili konular
            for topic in data.get('RelatedTopics', [])[:num_results-len(results)]:
                if isinstance(topic, dict) and topic.get('Text'):
                    results.append({
                        'title': topic.get('Text', '').split(' - ')[0],
                        'url': topic.get('FirstURL', ''),
                        'domain': 'DuckDuckGo',
                        'description': topic.get('Text', '')
                    })
            
            return results
        
    except Exception as e:
        current_app.logger.error(f'Backup search error: {e}')
    
    return None

@api_bp.route('/usage', methods=['GET'])
@require_api_key
def api_usage():
    """API kullanım istatistikleri"""
    try:
        user = request.current_user
        
        # Bu ay yapılan aramalar
        start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        monthly_usage = ApiUsage.query.filter(
            ApiUsage.user_id == user.id,
            ApiUsage.created_at >= start_of_month
        ).count()
        
        # Bugün yapılan aramalar
        start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        daily_usage = ApiUsage.query.filter(
            ApiUsage.user_id == user.id,
            ApiUsage.created_at >= start_of_day
        ).count()
        
        # Plan limitleri
        plan = user.subscription.plan if user.subscription else None
        
        return jsonify({
            'success': True,
            'usage': {
                'monthly': {
                    'used': monthly_usage,
                    'limit': plan.monthly_search_limit if plan else 0,
                    'remaining': max(0, plan.monthly_search_limit - monthly_usage) if plan else 0
                },
                'daily': {
                    'used': daily_usage
                },
                'plan': {
                    'name': plan.name if plan else 'No Plan',
                    'max_results_per_search': plan.max_results_per_search if plan else 0
                }
            },
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        current_app.logger.error(f'API usage error: {e}')
        return jsonify({
            'error': 'Kullanım bilgileri alınamadı',
            'code': 'USAGE_ERROR'
        }), 500

@api_bp.route('/keys', methods=['GET'])
@login_required
def list_api_keys():
    """Kullanıcının API anahtarlarını listele"""
    try:
        keys = ApiKey.query.filter_by(user_id=current_user.id).all()
        
        keys_data = []
        for key in keys:
            keys_data.append({
                'id': key.id,
                'name': key.name,
                'key_preview': key.key_hash[:8] + '...',
                'is_active': key.is_active,
                'created_at': key.created_at.isoformat(),
                'last_used_at': key.last_used_at.isoformat() if key.last_used_at else None
            })
        
        return jsonify({
            'success': True,
            'keys': keys_data
        })
        
    except Exception as e:
        current_app.logger.error(f'List API keys error: {e}')
        return jsonify({
            'error': 'API anahtarları listelenemedi',
            'code': 'LIST_KEYS_ERROR'
        }), 500

@api_bp.route('/keys', methods=['POST'])
@login_required
def create_api_key():
    """Yeni API anahtarı oluştur"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        
        if not name:
            return jsonify({
                'error': 'API anahtarı adı gereklidir',
                'code': 'MISSING_NAME'
            }), 400
        
        # Kullanıcının aktif aboneliği var mı kontrol et
        if not current_user.subscription or not current_user.subscription.is_active():
            return jsonify({
                'error': 'API anahtarı oluşturmak için aktif abonelik gereklidir',
                'code': 'SUBSCRIPTION_REQUIRED'
            }), 403
        
        # API anahtarı oluştur
        api_key = secrets.token_urlsafe(32)
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        api_key_obj = ApiKey(
            user_id=current_user.id,
            name=name,
            key_hash=key_hash
        )
        
        db.session.add(api_key_obj)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'api_key': api_key,
            'key_id': api_key_obj.id,
            'name': name,
            'warning': 'Bu API anahtarını güvenli bir yerde saklayın. Tekrar gösterilmeyecektir.'
        })
        
    except Exception as e:
        current_app.logger.error(f'Create API key error: {e}')
        return jsonify({
            'error': 'API anahtarı oluşturulamadı',
            'code': 'CREATE_KEY_ERROR'
        }), 500

@api_bp.route('/keys/<int:key_id>', methods=['DELETE'])
@login_required
def delete_api_key(key_id):
    """API anahtarını sil"""
    try:
        api_key = ApiKey.query.filter_by(
            id=key_id,
            user_id=current_user.id
        ).first()
        
        if not api_key:
            return jsonify({
                'error': 'API anahtarı bulunamadı',
                'code': 'KEY_NOT_FOUND'
            }), 404
        
        db.session.delete(api_key)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'API anahtarı başarıyla silindi'
        })
        
    except Exception as e:
        current_app.logger.error(f'Delete API key error: {e}')
        return jsonify({
            'error': 'API anahtarı silinemedi',
            'code': 'DELETE_KEY_ERROR'
        }), 500

@api_bp.route('/health', methods=['GET'])
def health_check():
    """API sağlık kontrolü"""
    return jsonify({
        'status': 'healthy',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })

@api_bp.errorhandler(429)
def ratelimit_handler(e):
    """Rate limit aşıldığında"""
    return jsonify({
        'error': 'Rate limit aşıldı',
        'code': 'RATE_LIMIT_EXCEEDED',
        'retry_after': e.retry_after
    }), 429

@api_bp.errorhandler(404)
def not_found_handler(e):
    """Endpoint bulunamadığında"""
    return jsonify({
        'error': 'Endpoint bulunamadı',
        'code': 'ENDPOINT_NOT_FOUND'
    }), 404

@api_bp.errorhandler(500)
def internal_error_handler(e):
    """Sunucu hatası"""
    return jsonify({
        'error': 'Sunucu hatası',
        'code': 'INTERNAL_SERVER_ERROR'
    }), 500