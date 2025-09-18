from flask import Blueprint, render_template, request, flash, redirect, url_for, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash
from models import db, User, Subscription, SubscriptionPlan
from datetime import datetime, timedelta
import uuid
import secrets
from email_utils import send_verification_email, send_password_reset_email

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

# Rate limiting
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@auth_bp.route('/register', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def register():
    """Kullanıcı kayıt"""
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        
        # Form verilerini al
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        confirm_password = data.get('confirm_password', '')
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        company_name = data.get('company_name', '').strip()
        phone = data.get('phone', '').strip()
        
        # Validasyon
        errors = []
        
        if not email or '@' not in email:
            errors.append('Geçerli bir e-posta adresi giriniz.')
        
        if len(password) < 8:
            errors.append('Şifre en az 8 karakter olmalıdır.')
        
        if password != confirm_password:
            errors.append('Şifreler eşleşmiyor.')
        
        if not first_name or not last_name:
            errors.append('Ad ve soyad zorunludur.')
        
        # E-posta kontrolü
        if User.query.filter_by(email=email).first():
            errors.append('Bu e-posta adresi zaten kayıtlı.')
        
        if errors:
            if request.is_json:
                return jsonify({'success': False, 'errors': errors}), 400
            for error in errors:
                flash(error, 'error')
            return render_template('auth/register.html')
        
        try:
            # Yeni kullanıcı oluştur
            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                company_name=company_name,
                phone=phone,
                verification_token=secrets.token_urlsafe(32)
            )
            user.set_password(password)
            
            db.session.add(user)
            db.session.commit()
            
            # Doğrulama e-postası gönder
            try:
                send_verification_email(user)
                message = 'Kayıt başarılı! E-posta adresinize doğrulama linki gönderildi.'
            except Exception as e:
                current_app.logger.error(f'Verification email error: {e}')
                message = 'Kayıt başarılı! Ancak doğrulama e-postası gönderilemedi.'
            
            if request.is_json:
                return jsonify({
                    'success': True, 
                    'message': message,
                    'redirect': url_for('auth.login')
                })
            
            flash(message, 'success')
            return redirect(url_for('auth.login'))
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f'Registration error: {e}')
            error_msg = 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyiniz.'
            
            if request.is_json:
                return jsonify({'success': False, 'errors': [error_msg]}), 500
            
            flash(error_msg, 'error')
    
    return render_template('auth/register.html')

@auth_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit("10 per minute")
def login():
    """Kullanıcı girişi"""
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        remember_me = data.get('remember_me', False)
        
        if not email or not password:
            error_msg = 'E-posta ve şifre zorunludur.'
            if request.is_json:
                return jsonify({'success': False, 'error': error_msg}), 400
            flash(error_msg, 'error')
            return render_template('auth/login.html')
        
        # Kullanıcıyı bul
        user = User.query.filter_by(email=email).first()
        
        if user and user.check_password(password):
            if not user.is_active:
                error_msg = 'Hesabınız devre dışı bırakılmış.'
                if request.is_json:
                    return jsonify({'success': False, 'error': error_msg}), 403
                flash(error_msg, 'error')
                return render_template('auth/login.html')
            
            # Giriş yap
            login_user(user, remember=remember_me)
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            # Yönlendirme
            next_page = request.args.get('next')
            if not next_page or not next_page.startswith('/'):
                next_page = url_for('main.dashboard')
            
            if request.is_json:
                return jsonify({
                    'success': True, 
                    'message': 'Giriş başarılı!',
                    'redirect': next_page
                })
            
            flash('Hoş geldiniz!', 'success')
            return redirect(next_page)
        else:
            error_msg = 'Geçersiz e-posta veya şifre.'
            if request.is_json:
                return jsonify({'success': False, 'error': error_msg}), 401
            flash(error_msg, 'error')
    
    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    """Kullanıcı çıkışı"""
    logout_user()
    flash('Başarıyla çıkış yaptınız.', 'info')
    return redirect(url_for('main.index'))

@auth_bp.route('/verify/<token>')
def verify_email(token):
    """E-posta doğrulama"""
    user = User.query.filter_by(verification_token=token).first()
    
    if not user:
        flash('Geçersiz doğrulama linki.', 'error')
        return redirect(url_for('auth.login'))
    
    if user.is_verified:
        flash('E-posta adresiniz zaten doğrulanmış.', 'info')
        return redirect(url_for('auth.login'))
    
    # E-postayı doğrula
    user.is_verified = True
    user.verification_token = None
    
    # Ücretsiz deneme aboneliği oluştur
    basic_plan = SubscriptionPlan.query.filter_by(name='Basic').first()
    if basic_plan:
        subscription = Subscription(
            user_id=user.id,
            plan_id=basic_plan.id,
            status='trialing',
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=14)  # 14 günlük deneme
        )
        db.session.add(subscription)
    
    db.session.commit()
    
    flash('E-posta adresiniz doğrulandı! 14 günlük ücretsiz deneme başladı.', 'success')
    return redirect(url_for('auth.login'))

@auth_bp.route('/forgot-password', methods=['GET', 'POST'])
@limiter.limit("3 per minute")
def forgot_password():
    """Şifre sıfırlama talebi"""
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        email = data.get('email', '').strip().lower()
        
        if not email:
            error_msg = 'E-posta adresi zorunludur.'
            if request.is_json:
                return jsonify({'success': False, 'error': error_msg}), 400
            flash(error_msg, 'error')
            return render_template('auth/forgot_password.html')
        
        user = User.query.filter_by(email=email).first()
        
        if user and user.is_active:
            # Reset token oluştur
            reset_token = secrets.token_urlsafe(32)
            user.verification_token = reset_token  # Geçici olarak bu alanı kullan
            db.session.commit()
            
            try:
                send_password_reset_email(user, reset_token)
                message = 'Şifre sıfırlama linki e-posta adresinize gönderildi.'
            except Exception as e:
                current_app.logger.error(f'Password reset email error: {e}')
                message = 'E-posta gönderilirken bir hata oluştu.'
        else:
            # Güvenlik için her zaman başarılı mesajı göster
            message = 'Eğer bu e-posta kayıtlıysa, şifre sıfırlama linki gönderildi.'
        
        if request.is_json:
            return jsonify({'success': True, 'message': message})
        
        flash(message, 'info')
        return redirect(url_for('auth.login'))
    
    return render_template('auth/forgot_password.html')

@auth_bp.route('/reset-password/<token>', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def reset_password(token):
    """Şifre sıfırlama"""
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    
    user = User.query.filter_by(verification_token=token).first()
    
    if not user:
        flash('Geçersiz veya süresi dolmuş sıfırlama linki.', 'error')
        return redirect(url_for('auth.forgot_password'))
    
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        
        password = data.get('password', '')
        confirm_password = data.get('confirm_password', '')
        
        errors = []
        
        if len(password) < 8:
            errors.append('Şifre en az 8 karakter olmalıdır.')
        
        if password != confirm_password:
            errors.append('Şifreler eşleşmiyor.')
        
        if errors:
            if request.is_json:
                return jsonify({'success': False, 'errors': errors}), 400
            for error in errors:
                flash(error, 'error')
            return render_template('auth/reset_password.html', token=token)
        
        # Şifreyi güncelle
        user.set_password(password)
        user.verification_token = None
        db.session.commit()
        
        message = 'Şifreniz başarıyla güncellendi.'
        if request.is_json:
            return jsonify({
                'success': True, 
                'message': message,
                'redirect': url_for('auth.login')
            })
        
        flash(message, 'success')
        return redirect(url_for('auth.login'))
    
    return render_template('auth/reset_password.html', token=token)

@auth_bp.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    """Kullanıcı profili"""
    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        
        # Profil bilgilerini güncelle
        current_user.first_name = data.get('first_name', current_user.first_name).strip()
        current_user.last_name = data.get('last_name', current_user.last_name).strip()
        current_user.company_name = data.get('company_name', current_user.company_name or '').strip()
        current_user.phone = data.get('phone', current_user.phone or '').strip()
        
        # Şifre değişikliği
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')
        
        errors = []
        
        if new_password:
            if not current_password or not current_user.check_password(current_password):
                errors.append('Mevcut şifre yanlış.')
            elif len(new_password) < 8:
                errors.append('Yeni şifre en az 8 karakter olmalıdır.')
            elif new_password != confirm_password:
                errors.append('Yeni şifreler eşleşmiyor.')
            else:
                current_user.set_password(new_password)
        
        if errors:
            if request.is_json:
                return jsonify({'success': False, 'errors': errors}), 400
            for error in errors:
                flash(error, 'error')
            return render_template('auth/profile.html')
        
        current_user.updated_at = datetime.utcnow()
        db.session.commit()
        
        message = 'Profil bilgileriniz güncellendi.'
        if request.is_json:
            return jsonify({'success': True, 'message': message})
        
        flash(message, 'success')
        return redirect(url_for('auth.profile'))
    
    return render_template('auth/profile.html')

@auth_bp.route('/subscription')
@login_required
def subscription():
    """Abonelik bilgileri"""
    subscription = current_user.subscription
    plans = SubscriptionPlan.query.filter_by(is_active=True).all()
    
    return render_template('auth/subscription.html', 
                         subscription=subscription, 
                         plans=plans)