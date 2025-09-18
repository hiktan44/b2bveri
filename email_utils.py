from flask import current_app, url_for, render_template_string
from flask_mail import Message, Mail
import os

mail = Mail()

def send_email(to, subject, template, **kwargs):
    """E-posta gönder"""
    try:
        msg = Message(
            subject=f"[{current_app.config['APP_NAME']}] {subject}",
            recipients=[to] if isinstance(to, str) else to,
            sender=current_app.config['MAIL_DEFAULT_SENDER']
        )
        
        msg.html = render_template_string(template, **kwargs)
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.error(f'Email sending failed: {e}')
        return False

def send_verification_email(user):
    """E-posta doğrulama maili gönder"""
    verification_url = url_for('auth.verify_email', 
                              token=user.verification_token, 
                              _external=True)
    
    template = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>E-posta Doğrulama</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8f9fa; }
            .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>{{ app_name }}</h1>
            </div>
            <div class="content">
                <h2>Merhaba {{ user.first_name }}!</h2>
                <p>{{ app_name }} platformuna hoş geldiniz! Hesabınızı aktifleştirmek için aşağıdaki butona tıklayın:</p>
                
                <a href="{{ verification_url }}" class="button">E-postamı Doğrula</a>
                
                <p>Eğer buton çalışmıyorsa, aşağıdaki linki tarayıcınıza kopyalayın:</p>
                <p><a href="{{ verification_url }}">{{ verification_url }}</a></p>
                
                <p>Bu link 24 saat geçerlidir.</p>
                
                <p><strong>Hesap Bilgileriniz:</strong></p>
                <ul>
                    <li>E-posta: {{ user.email }}</li>
                    <li>Şirket: {{ user.company_name or 'Belirtilmemiş' }}</li>
                    <li>Kayıt Tarihi: {{ user.created_at.strftime('%d.%m.%Y %H:%M') }}</li>
                </ul>
                
                <p>Doğrulama işleminden sonra 14 günlük ücretsiz deneme süreniz başlayacaktır.</p>
            </div>
            <div class="footer">
                <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                <p>{{ app_name }} - B2B Veri Toplayıcı</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(
        to=user.email,
        subject='E-posta Adresinizi Doğrulayın',
        template=template,
        user=user,
        verification_url=verification_url,
        app_name=current_app.config['APP_NAME']
    )

def send_password_reset_email(user, reset_token):
    """Şifre sıfırlama maili gönder"""
    reset_url = url_for('auth.reset_password', 
                       token=reset_token, 
                       _external=True)
    
    template = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Şifre Sıfırlama</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8f9fa; }
            .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Şifre Sıfırlama</h1>
            </div>
            <div class="content">
                <h2>Merhaba {{ user.first_name }}!</h2>
                <p>{{ app_name }} hesabınız için şifre sıfırlama talebinde bulundunuz.</p>
                
                <div class="warning">
                    <strong>Güvenlik Uyarısı:</strong> Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin ve hesabınızın güvenliği için şifrenizi değiştirmeyi düşünün.
                </div>
                
                <p>Yeni şifre belirlemek için aşağıdaki butona tıklayın:</p>
                
                <a href="{{ reset_url }}" class="button">Şifremi Sıfırla</a>
                
                <p>Eğer buton çalışmıyorsa, aşağıdaki linki tarayıcınıza kopyalayın:</p>
                <p><a href="{{ reset_url }}">{{ reset_url }}</a></p>
                
                <p>Bu link 1 saat geçerlidir.</p>
                
                <p><strong>Hesap Bilgileri:</strong></p>
                <ul>
                    <li>E-posta: {{ user.email }}</li>
                    <li>Son Giriş: {{ user.last_login.strftime('%d.%m.%Y %H:%M') if user.last_login else 'Hiç giriş yapılmamış' }}</li>
                </ul>
            </div>
            <div class="footer">
                <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                <p>{{ app_name }} - B2B Veri Toplayıcı</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(
        to=user.email,
        subject='Şifre Sıfırlama Talebi',
        template=template,
        user=user,
        reset_url=reset_url,
        app_name=current_app.config['APP_NAME']
    )

def send_welcome_email(user):
    """Hoş geldin maili gönder"""
    dashboard_url = url_for('main.dashboard', _external=True)
    
    template = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Hoş Geldiniz!</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8f9fa; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Hoş Geldiniz!</h1>
            </div>
            <div class="content">
                <h2>Merhaba {{ user.first_name }}!</h2>
                <p>{{ app_name }} ailesine katıldığınız için teşekkür ederiz! 14 günlük ücretsiz deneme süreniz başlamıştır.</p>
                
                <a href="{{ dashboard_url }}" class="button">Panele Git</a>
                
                <h3>Neler Yapabilirsiniz:</h3>
                
                <div class="feature">
                    <h4>🔍 Gelişmiş Arama</h4>
                    <p>Çoklu ülke desteği ile kapsamlı B2B veri toplama</p>
                </div>
                
                <div class="feature">
                    <h4>📊 Detaylı Raporlar</h4>
                    <p>Excel formatında indirilebilir sonuçlar</p>
                </div>
                
                <div class="feature">
                    <h4>🚀 API Erişimi</h4>
                    <p>Pro ve Enterprise planlarında API entegrasyonu</p>
                </div>
                
                <div class="feature">
                    <h4>📈 Kullanım İstatistikleri</h4>
                    <p>Arama geçmişi ve performans takibi</p>
                </div>
                
                <p><strong>Deneme Süreniz:</strong></p>
                <ul>
                    <li>Süre: 14 gün</li>
                    <li>Aylık Arama Limiti: {{ user.subscription.plan.monthly_search_limit if user.subscription else 500 }}</li>
                    <li>Sonuç Limiti: {{ user.subscription.plan.max_results_per_search if user.subscription else 50 }}</li>
                </ul>
                
                <p>Sorularınız için {{ support_email }} adresinden bize ulaşabilirsiniz.</p>
            </div>
            <div class="footer">
                <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                <p>{{ app_name }} - B2B Veri Toplayıcı</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(
        to=user.email,
        subject='Hoş Geldiniz! Deneme Süreniz Başladı',
        template=template,
        user=user,
        dashboard_url=dashboard_url,
        app_name=current_app.config['APP_NAME'],
        support_email=current_app.config['SUPPORT_EMAIL']
    )

def send_subscription_notification(user, subscription, event_type):
    """Abonelik bildirimi gönder"""
    subjects = {
        'created': 'Aboneliğiniz Başladı!',
        'renewed': 'Aboneliğiniz Yenilendi',
        'canceled': 'Aboneliğiniz İptal Edildi',
        'expired': 'Aboneliğiniz Sona Erdi',
        'trial_ending': 'Deneme Süreniz Sona Eriyor'
    }
    
    template = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Abonelik Bildirimi</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8f9fa; }
            .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Abonelik Bildirimi</h1>
            </div>
            <div class="content">
                <h2>Merhaba {{ user.first_name }}!</h2>
                
                {% if event_type == 'created' %}
                    <p>{{ subscription.plan.name }} planına aboneliğiniz başarıyla oluşturuldu!</p>
                {% elif event_type == 'renewed' %}
                    <p>{{ subscription.plan.name }} planı aboneliğiniz yenilendi.</p>
                {% elif event_type == 'canceled' %}
                    <p>{{ subscription.plan.name }} planı aboneliğiniz iptal edildi.</p>
                {% elif event_type == 'expired' %}
                    <p>{{ subscription.plan.name }} planı aboneliğiniz sona erdi.</p>
                {% elif event_type == 'trial_ending' %}
                    <p>Deneme süreniz 3 gün içinde sona erecek!</p>
                {% endif %}
                
                <div class="info-box">
                    <h4>Abonelik Detayları:</h4>
                    <ul>
                        <li>Plan: {{ subscription.plan.name }}</li>
                        <li>Aylık Fiyat: ${{ subscription.plan.price }}</li>
                        <li>Durum: {{ subscription.status }}</li>
                        <li>Dönem Başı: {{ subscription.current_period_start.strftime('%d.%m.%Y') }}</li>
                        <li>Dönem Sonu: {{ subscription.current_period_end.strftime('%d.%m.%Y') }}</li>
                    </ul>
                </div>
                
                {% if event_type in ['canceled', 'expired', 'trial_ending'] %}
                    <a href="{{ url_for('auth.subscription', _external=True) }}" class="button">Abonelik Yönetimi</a>
                {% endif %}
            </div>
            <div class="footer">
                <p>Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
                <p>{{ app_name }} - B2B Veri Toplayıcı</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(
        to=user.email,
        subject=subjects.get(event_type, 'Abonelik Bildirimi'),
        template=template,
        user=user,
        subscription=subscription,
        event_type=event_type,
        app_name=current_app.config['APP_NAME']
    )