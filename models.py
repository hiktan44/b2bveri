from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from decimal import Decimal
import secrets
import uuid

db = SQLAlchemy()

class User(UserMixin, db.Model):
    """Kullanıcı modeli"""
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    company_name = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    
    # Hesap durumu
    is_active = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)
    verification_token = db.Column(db.String(100))
    
    # Tarihler
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # İlişkiler
    subscription = db.relationship('Subscription', backref='user', uselist=False)
    searches = db.relationship('SearchHistory', backref='user', lazy='dynamic')
    api_keys = db.relationship('ApiKey', backref='user', lazy='dynamic')
    
    def set_password(self, password):
        """Şifreyi hash'leyerek kaydet"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Şifreyi kontrol et"""
        return check_password_hash(self.password_hash, password)
    
    def get_full_name(self):
        """Tam adı döndür"""
        return f"{self.first_name} {self.last_name}"
    
    def has_active_subscription(self):
        """Aktif aboneliği var mı?"""
        return self.subscription and self.subscription.is_active()
    
    def get_monthly_search_count(self):
        """Bu ayki arama sayısını döndür"""
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return self.searches.filter(SearchHistory.created_at >= start_of_month).count()
    
    def can_search(self):
        """Arama yapabilir mi?"""
        if not self.has_active_subscription():
            return False
        
        monthly_count = self.get_monthly_search_count()
        return monthly_count < self.subscription.plan.monthly_search_limit

class SubscriptionPlan(db.Model):
    """Abonelik planları"""
    __tablename__ = 'subscription_plans'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(50), nullable=False)  # Basic, Pro, Enterprise
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)  # Aylık fiyat
    currency = db.Column(db.String(3), default='USD')
    
    # Limitler
    monthly_search_limit = db.Column(db.Integer, nullable=False)
    max_results_per_search = db.Column(db.Integer, nullable=False)
    api_access = db.Column(db.Boolean, default=False)
    priority_support = db.Column(db.Boolean, default=False)
    
    # Stripe entegrasyonu
    stripe_price_id = db.Column(db.String(100))
    
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # İlişkiler
    subscriptions = db.relationship('Subscription', backref='plan', lazy='dynamic')

class Subscription(db.Model):
    """Kullanıcı abonelikleri"""
    __tablename__ = 'subscriptions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    plan_id = db.Column(db.String(36), db.ForeignKey('subscription_plans.id'), nullable=False)
    
    # Stripe entegrasyonu
    stripe_subscription_id = db.Column(db.String(100))
    stripe_customer_id = db.Column(db.String(100))
    
    # Abonelik durumu
    status = db.Column(db.String(20), default='active')  # active, canceled, past_due, unpaid
    current_period_start = db.Column(db.DateTime, nullable=False)
    current_period_end = db.Column(db.DateTime, nullable=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def is_active(self):
        """Abonelik aktif mi?"""
        return (self.status == 'active' and 
                self.current_period_end > datetime.utcnow())
    
    def days_remaining(self):
        """Kalan gün sayısı"""
        if self.is_active():
            return (self.current_period_end - datetime.utcnow()).days
        return 0

class SearchHistory(db.Model):
    """Arama geçmişi"""
    __tablename__ = 'search_history'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Arama parametreleri
    search_query = db.Column(db.Text, nullable=False)
    result_count = db.Column(db.Integer, nullable=False)
    countries = db.Column(db.JSON)  # Seçilen ülkeler
    
    # Sonuçlar
    results_data = db.Column(db.JSON)  # Bulunan veriler
    success_count = db.Column(db.Integer, default=0)  # Başarılı sonuç sayısı
    
    # Meta bilgiler
    execution_time = db.Column(db.Float)  # Saniye cinsinden
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ApiKey(db.Model):
    """API anahtarları"""
    __tablename__ = 'api_keys'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)  # API anahtarı adı
    
    # Limitler
    daily_limit = db.Column(db.Integer, default=100)
    monthly_limit = db.Column(db.Integer, default=1000)
    
    # Durum
    is_active = db.Column(db.Boolean, default=True)
    last_used = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def generate_key(self):
        """Yeni API anahtarı oluştur"""
        import secrets
        self.key = f"bvt_{secrets.token_urlsafe(48)}"
    
    def get_daily_usage(self):
        """Günlük kullanım sayısını döndür"""
        today = datetime.utcnow().date()
        return ApiUsage.query.filter(
            ApiUsage.api_key_id == self.id,
            db.func.date(ApiUsage.created_at) == today
        ).count()
    
    def get_monthly_usage(self):
        """Aylık kullanım sayısını döndür"""
        start_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return ApiUsage.query.filter(
            ApiUsage.api_key_id == self.id,
            ApiUsage.created_at >= start_of_month
        ).count()

class ApiUsage(db.Model):
    """API kullanım geçmişi"""
    __tablename__ = 'api_usage'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    api_key_id = db.Column(db.String(36), db.ForeignKey('api_keys.id'), nullable=False)
    
    endpoint = db.Column(db.String(100), nullable=False)
    method = db.Column(db.String(10), nullable=False)
    status_code = db.Column(db.Integer, nullable=False)
    response_time = db.Column(db.Float)  # Milisaniye
    
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # İlişkiler
    api_key = db.relationship('ApiKey', backref='usage_logs')

class SystemSettings(db.Model):
    """Sistem ayarları"""
    __tablename__ = 'system_settings'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)
    description = db.Column(db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get_setting(key, default=None):
        """Ayar değerini getir"""
        setting = SystemSettings.query.filter_by(key=key).first()
        return setting.value if setting else default
    
    @staticmethod
    def set_setting(key, value, description=None):
        """Ayar değerini kaydet"""
        setting = SystemSettings.query.filter_by(key=key).first()
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
        else:
            setting = SystemSettings(key=key, value=value, description=description)
            db.session.add(setting)
        db.session.commit()
        return setting