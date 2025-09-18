from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash, send_file
from flask_login import LoginManager, login_required, current_user
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import logging
from datetime import datetime, timedelta
import redis

# Modülleri import et
from config import config
from models import db, User, SubscriptionPlan, Subscription, SearchHistory, SystemSettings
from auth import auth_bp
from email_utils import mail
from payment import payment_bp
from api import api_bp

def create_app(config_name=None):
    """Flask uygulaması factory"""
    app = Flask(__name__)
    
    # Konfigürasyon
    config_name = config_name or os.environ.get('FLASK_ENV', 'development')
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    
    # Proxy fix (production için)
    if config_name == 'production':
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    
    # Veritabanı
    db.init_app(app)
    migrate = Migrate(app, db)
    
    # Login Manager
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Bu sayfaya erişmek için giriş yapmalısınız.'
    login_manager.login_message_category = 'info'
    
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(user_id)
    
    # Mail
    mail.init_app(app)
    
    # Rate Limiting
    limiter = Limiter(
        app,
        key_func=get_remote_address,
        default_limits=["1000 per hour"],
        storage_uri=app.config['REDIS_URL']
    )
    
    # Redis bağlantısı
    try:
        redis_client = redis.from_url(app.config['REDIS_URL'])
        app.redis = redis_client
    except Exception as e:
        app.logger.error(f'Redis connection failed: {e}')
        app.redis = None
    
    # Blueprintleri kaydet
    app.register_blueprint(auth_bp)
    app.register_blueprint(payment_bp)
    app.register_blueprint(api_bp)
    
    # Ana rotalar
    @app.route('/')
    def index():
        """Ana sayfa"""
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        
        plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price).all()
        return render_template('index.html', plans=plans)
    
    @app.route('/dashboard')
    @login_required
    def dashboard():
        """Kullanıcı paneli"""
        # Kullanım istatistikleri
        monthly_searches = current_user.get_monthly_search_count()
        recent_searches = current_user.searches.order_by(SearchHistory.created_at.desc()).limit(5).all()
        
        # Abonelik bilgileri
        subscription = current_user.subscription
        
        stats = {
            'monthly_searches': monthly_searches,
            'monthly_limit': subscription.plan.monthly_search_limit if subscription else 0,
            'remaining_searches': max(0, (subscription.plan.monthly_search_limit if subscription else 0) - monthly_searches),
            'subscription_days_left': subscription.days_remaining() if subscription else 0
        }
        
        return render_template('dashboard.html', 
                             stats=stats, 
                             recent_searches=recent_searches,
                             subscription=subscription)
    
    @app.route('/search', methods=['GET', 'POST'])
    @login_required
    @limiter.limit("30 per minute")
    def search():
        """Arama sayfası"""
        # Abonelik kontrolü
        if not current_user.has_active_subscription():
            flash('Arama yapmak için aktif bir aboneliğiniz olmalıdır.', 'error')
            return redirect(url_for('auth.subscription'))
        
        # Kullanım kotası kontrolü
        if not current_user.can_search():
            flash('Aylık arama limitinizi aştınız. Planınızı yükseltmeyi düşünün.', 'error')
            return redirect(url_for('dashboard'))
        
        if request.method == 'POST':
            try:
                # Arama parametrelerini al
                data = request.get_json() if request.is_json else request.form
                
                search_query = data.get('query', '').strip()
                result_count = min(int(data.get('sayi', 50)), current_user.subscription.plan.max_results_per_search)
                countries = data.getlist('countries') if hasattr(data, 'getlist') else data.get('countries', [])
                
                if not search_query:
                    return jsonify({'success': False, 'error': 'Arama terimi gereklidir.'}), 400
                
                # Arama işlemini gerçekleştir (mevcut app.py'den import)
                from search_engine import perform_search
                
                start_time = datetime.utcnow()
                results = perform_search(search_query, result_count, countries)
                execution_time = (datetime.utcnow() - start_time).total_seconds()
                
                # Arama geçmişine kaydet
                search_history = SearchHistory(
                    user_id=current_user.id,
                    search_query=search_query,
                    result_count=result_count,
                    countries=countries,
                    results_data=results,
                    success_count=len(results) if results else 0,
                    execution_time=execution_time,
                    ip_address=request.remote_addr,
                    user_agent=request.user_agent.string
                )
                
                db.session.add(search_history)
                db.session.commit()
                
                if request.is_json:
                    return jsonify({
                        'success': True,
                        'results': results,
                        'count': len(results) if results else 0,
                        'execution_time': execution_time
                    })
                
                return render_template('search_results.html', 
                                     results=results, 
                                     query=search_query,
                                     execution_time=execution_time)
                
            except Exception as e:
                app.logger.error(f'Search error: {e}')
                error_msg = 'Arama sırasında bir hata oluştu. Lütfen tekrar deneyiniz.'
                
                if request.is_json:
                    return jsonify({'success': False, 'error': error_msg}), 500
                
                flash(error_msg, 'error')
        
        # Kullanılabilir ülkeler
        countries = [
            {'code': 'tr', 'name': 'Türkiye'},
            {'code': 'us', 'name': 'Amerika'},
            {'code': 'de', 'name': 'Almanya'},
            {'code': 'fr', 'name': 'Fransa'},
            {'code': 'uk', 'name': 'İngiltere'},
            {'code': 'it', 'name': 'İtalya'},
            {'code': 'es', 'name': 'İspanya'},
            {'code': 'nl', 'name': 'Hollanda'}
        ]
        
        return render_template('search.html', 
                             countries=countries,
                             max_results=current_user.subscription.plan.max_results_per_search)
    
    @app.route('/history')
    @login_required
    def search_history():
        """Arama geçmişi"""
        page = request.args.get('page', 1, type=int)
        per_page = 20
        
        searches = current_user.searches.order_by(SearchHistory.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return render_template('history.html', searches=searches)
    
    @app.route('/export/<search_id>')
    @login_required
    def export_search(search_id):
        """Arama sonucunu Excel olarak indir"""
        search = SearchHistory.query.filter_by(id=search_id, user_id=current_user.id).first_or_404()
        
        if not search.results_data:
            flash('Bu aramada sonuç bulunamadı.', 'error')
            return redirect(url_for('search_history'))
        
        try:
            # Excel dosyası oluştur
            from export_utils import create_excel_file
            
            filename = f"arama_sonuclari_{search.created_at.strftime('%Y%m%d_%H%M%S')}.xlsx"
            filepath = create_excel_file(search.results_data, filename)
            
            return send_file(filepath, as_attachment=True, download_name=filename)
            
        except Exception as e:
            app.logger.error(f'Export error: {e}')
            flash('Dosya oluşturulurken bir hata oluştu.', 'error')
            return redirect(url_for('search_history'))
    
    @app.route('/pricing')
    def pricing():
        """Fiyatlandırma sayfası"""
        plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price).all()
        return render_template('pricing.html', plans=plans)
    
    @app.route('/contact')
    def contact():
        """İletişim sayfası"""
        return render_template('contact.html')
    
    @app.route('/about')
    def about():
        """Hakkımızda sayfası"""
        return render_template('about.html')
    
    @app.route('/terms')
    def terms():
        """Kullanım şartları"""
        return render_template('terms.html')
    
    @app.route('/privacy')
    def privacy():
        """Gizlilik politikası"""
        return render_template('privacy.html')
    
    # Hata işleyicileri
    @app.errorhandler(404)
    def not_found_error(error):
        return render_template('errors/404.html'), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return render_template('errors/500.html'), 500
    
    @app.errorhandler(403)
    def forbidden_error(error):
        return render_template('errors/403.html'), 403
    
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return render_template('errors/429.html'), 429
    
    # Template context processors
    @app.context_processor
    def inject_globals():
        return {
            'app_name': app.config['APP_NAME'],
            'app_version': app.config['APP_VERSION'],
            'support_email': app.config['SUPPORT_EMAIL'],
            'current_year': datetime.utcnow().year
        }
    
    # CLI komutları
    @app.cli.command()
    def init_db():
        """Veritabanını başlat"""
        db.create_all()
        
        # Varsayılan planları oluştur
        from config import DEFAULT_SUBSCRIPTION_PLANS
        
        for plan_data in DEFAULT_SUBSCRIPTION_PLANS:
            existing_plan = SubscriptionPlan.query.filter_by(name=plan_data['name']).first()
            if not existing_plan:
                plan = SubscriptionPlan(**plan_data)
                db.session.add(plan)
        
        db.session.commit()
        print('Veritabanı başlatıldı!')
    
    @app.cli.command()
    def create_admin():
        """Admin kullanıcısı oluştur"""
        email = input('Admin e-posta: ')
        password = input('Admin şifre: ')
        first_name = input('Ad: ')
        last_name = input('Soyad: ')
        
        admin = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            is_verified=True,
            is_active=True
        )
        admin.set_password(password)
        
        db.session.add(admin)
        db.session.commit()
        
        print(f'Admin kullanıcısı oluşturuldu: {email}')
    
    # Logging ayarları
    if not app.debug and not app.testing:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        
        file_handler = logging.FileHandler('logs/b2bveri.log')
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        
        app.logger.setLevel(logging.INFO)
        app.logger.info('B2B Veri SaaS startup')
    
    return app

# Uygulama oluştur
app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)