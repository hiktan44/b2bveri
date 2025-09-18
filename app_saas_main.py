from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session, g
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_wtf import FlaskForm
from flask_mail import Mail, Message
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
from flask_caching import Cache
from flask_compress import Compress
from flask_talisman import Talisman
from wtforms import StringField, PasswordField, EmailField, SelectField, TextAreaField, BooleanField
from wtforms.validators import DataRequired, Email, Length, EqualTo
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
import os
import secrets
import stripe
import redis
import json
from functools import wraps
from email_validator import validate_email, EmailNotValidError
import logging
from logging.handlers import RotatingFileHandler
from config_saas import config

# Import models and db
from models import db, User, SubscriptionPlan as Plan, Subscription, SearchHistory, ApiKey

# Extensions
migrate = Migrate()
login_manager = LoginManager()
mail = Mail()
cache = Cache()
compress = Compress()
talisman = Talisman()
cors = CORS()
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per day", "50 per hour"])

# Configure login manager
login_manager.login_view = 'login'
login_manager.login_message = 'Lütfen giriş yapın.'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def create_app(config_name=None):
    app = Flask(__name__)
    
    # Load configuration
    if config_name:
        app.config.from_object(config[config_name])
    else:
        app.config.from_object(config['development'])
    
    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    mail.init_app(app)
    cache.init_app(app)
    compress.init_app(app)
    cors.init_app(app)
    limiter.init_app(app)
    
    # Setup logging
    setup_logging(app)
    
    # Register error handlers
    register_error_handlers(app)
    
    # Register context processors
    register_context_processors(app)
    
    # Register routes
    register_routes(app)
    
    return app

def setup_logging(app):
    if not app.debug and not app.testing:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        file_handler = RotatingFileHandler('logs/b2bveri.log', maxBytes=10240, backupCount=10)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('B2B Veri startup')

def register_error_handlers(app):
    @app.errorhandler(404)
    def not_found_error(error):
        return render_template('errors/404.html'), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return render_template('errors/500.html'), 500

def register_context_processors(app):
    @app.context_processor
    def inject_user():
        return {
            'current_user': current_user
        }

def register_routes(app):
    @app.route('/')
    def index():
        return render_template('index.html')
    
    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for('dashboard'))
        
        form = LoginForm()
        if form.validate_on_submit():
            user = User.query.filter_by(email=form.email.data).first()
            if user and user.check_password(form.password.data):
                login_user(user, remember=form.remember_me.data)
                user.last_login = datetime.utcnow()
                db.session.commit()
                
                next_page = request.args.get('next')
                if not next_page or not next_page.startswith('/'):
                    next_page = url_for('dashboard')
                return redirect(next_page)
            flash('Geçersiz e-posta veya şifre', 'error')
        
        return render_template('auth/login.html', form=form)
    
    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        return redirect(url_for('index'))
    
    @app.route('/dashboard')
    @login_required
    def dashboard():
        return render_template('dashboard.html')
    
    @app.route('/search')
    @login_required
    def search():
        return render_template('search.html')
    
    @app.route('/search_history')
    @login_required
    def search_history():
        return render_template('search_history.html')
    
    @app.route('/pricing')
    def pricing():
        return render_template('pricing.html')
    
    @app.route('/register')
    def register():
        return render_template('register.html')
    
    @app.route('/profile')
    @login_required
    def profile():
        return render_template('profile.html')
    
    @app.route('/subscription')
    @login_required
    def subscription():
        return render_template('subscription.html')
    
    @app.route('/api_keys')
    @login_required
    def api_keys():
        return render_template('api_keys.html')
    
    @app.route('/forgot_password')
    def forgot_password():
        return render_template('auth/forgot_password.html')
    
    @app.route('/run', methods=['POST'])
    @login_required
    def run_search():
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            # Placeholder for search functionality
            return jsonify({
                'status': 'success',
                'message': 'Search functionality will be implemented here',
                'data': data
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/favicon.ico')
    def favicon():
        return '', 204

# Forms
class LoginForm(FlaskForm):
    email = EmailField('E-posta', validators=[DataRequired(), Email()])
    password = PasswordField('Şifre', validators=[DataRequired()])
    remember_me = BooleanField('Beni hatırla')

class RegisterForm(FlaskForm):
    first_name = StringField('Ad', validators=[DataRequired(), Length(min=2, max=50)])
    last_name = StringField('Soyad', validators=[DataRequired(), Length(min=2, max=50)])
    email = EmailField('E-posta', validators=[DataRequired(), Email()])
    company_name = StringField('Şirket Adı', validators=[Length(max=100)])
    phone = StringField('Telefon', validators=[Length(max=20)])
    password = PasswordField('Şifre', validators=[
        DataRequired(), 
        Length(min=8, message='Şifre en az 8 karakter olmalıdır')
    ])
    password2 = PasswordField('Şifre Tekrar', validators=[
        DataRequired(), 
        EqualTo('password', message='Şifreler eşleşmiyor')
    ])
    terms = BooleanField('Kullanım şartlarını kabul ediyorum', validators=[DataRequired()])

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
        
        # Create default plans if they don't exist
        if not Plan.query.first():
            plans = [
                Plan(
                    name='Başlangıç',
                    description='Küçük işletmeler için ideal',
                    price=29.99,
                    monthly_search_limit=1000,
                    max_results_per_search=50,
                    api_access=False,
                    priority_support=False
                ),
                Plan(
                    name='Profesyonel',
                    description='Büyüyen işletmeler için',
                    price=99.99,
                    monthly_search_limit=5000,
                    max_results_per_search=500,
                    api_access=True,
                    priority_support=True
                ),
                Plan(
                    name='Kurumsal',
                    description='Büyük organizasyonlar için',
                    price=299.99,
                    monthly_search_limit=25000,
                    max_results_per_search=5000,
                    api_access=True,
                    priority_support=True
                )
            ]
            
            for plan in plans:
                db.session.add(plan)
            db.session.commit()
            print("Default plans created!")
    
    app.run(debug=True, host='0.0.0.0', port=5000)