#!/usr/bin/env python3
"""
Database initialization script for B2B Veri SaaS application
This script creates all database tables and populates them with initial data
"""

import os
import sys
from datetime import datetime, timedelta

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app_saas_main import create_app, db, User, Plan, Subscription, SearchHistory, ApiKey
from werkzeug.security import generate_password_hash

def init_database():
    """Initialize database with tables and sample data"""
    print("Initializing database...")
    
    # Create app instance
    app = create_app()
    
    with app.app_context():
        # Drop all tables (be careful in production!)
        print("Dropping existing tables...")
        db.drop_all()
        
        # Create all tables
        print("Creating tables...")
        db.create_all()
        
        # Create sample plans
        print("Creating sample plans...")
        create_sample_plans()
        
        # Create admin user
        print("Creating admin user...")
        create_admin_user()
        
        # Create sample users
        print("Creating sample users...")
        create_sample_users()
        
        print("Database initialization completed successfully!")

def create_sample_plans():
    """Create sample subscription plans"""
    plans = [
        {
            'name': 'Başlangıç',
            'description': 'Küçük işletmeler için ideal plan',
            'price': 99.0,
            'monthly_searches': 1000,
            'features': [
                '1.000 aylık arama',
                'Temel filtreleme',
                'CSV export',
                'Email desteği'
            ],
            'is_active': True
        },
        {
            'name': 'Profesyonel',
            'description': 'Büyüyen işletmeler için güçlü çözüm',
            'price': 199.0,
            'monthly_searches': 5000,
            'features': [
                '5.000 aylık arama',
                'Gelişmiş filtreleme',
                'CSV/Excel export',
                'API erişimi',
                'Öncelikli destek'
            ],
            'is_active': True
        },
        {
            'name': 'Kurumsal',
            'description': 'Büyük şirketler için sınırsız erişim',
            'price': 499.0,
            'monthly_searches': 25000,
            'features': [
                '25.000 aylık arama',
                'Tüm filtreleme seçenekleri',
                'Tüm export formatları',
                'Tam API erişimi',
                'Özel entegrasyonlar',
                '7/24 destek',
                'Özel raporlama'
            ],
            'is_active': True
        },
        {
            'name': 'Deneme',
            'description': 'Ücretsiz deneme planı',
            'price': 0.0,
            'monthly_searches': 100,
            'features': [
                '100 aylık arama',
                'Temel özellikler',
                '7 gün deneme'
            ],
            'is_active': True
        }
    ]
    
    for plan_data in plans:
        plan = Plan(
            name=plan_data['name'],
            description=plan_data['description'],
            price=plan_data['price'],
            monthly_searches=plan_data['monthly_searches'],
            features=plan_data['features'],
            is_active=plan_data['is_active']
        )
        db.session.add(plan)
    
    db.session.commit()
    print(f"Created {len(plans)} sample plans")

def create_admin_user():
    """Create admin user"""
    admin = User(
        email='admin@b2bveri.com',
        first_name='Admin',
        last_name='User',
        company_name='B2B Veri',
        phone='+90 555 123 4567',
        is_verified=True,
        is_admin=True
    )
    admin.set_password('admin123')
    
    db.session.add(admin)
    db.session.commit()
    
    # Give admin a professional subscription
    professional_plan = Plan.query.filter_by(name='Profesyonel').first()
    if professional_plan:
        subscription = Subscription(
            user_id=admin.id,
            plan_id=professional_plan.id,
            status='active',
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=365),  # 1 year
            searches_used=0
        )
        db.session.add(subscription)
        
        # Create API key for admin
        import secrets
        api_key = ApiKey(
            user_id=admin.id,
            key='bv_' + secrets.token_urlsafe(32),
            name='Admin API Key',
            is_active=True
        )
        db.session.add(api_key)
        
        db.session.commit()
    
    print("Created admin user: admin@b2bveri.com / admin123")

def create_sample_users():
    """Create sample users for testing"""
    users_data = [
        {
            'email': 'test@example.com',
            'first_name': 'Test',
            'last_name': 'User',
            'company_name': 'Test Company',
            'phone': '+90 555 111 2233',
            'password': 'test123',
            'plan_name': 'Başlangıç'
        },
        {
            'email': 'demo@company.com',
            'first_name': 'Demo',
            'last_name': 'User',
            'company_name': 'Demo Corporation',
            'phone': '+90 555 444 5566',
            'password': 'demo123',
            'plan_name': 'Deneme'
        }
    ]
    
    for user_data in users_data:
        user = User(
            email=user_data['email'],
            first_name=user_data['first_name'],
            last_name=user_data['last_name'],
            company_name=user_data['company_name'],
            phone=user_data['phone'],
            is_verified=True
        )
        user.set_password(user_data['password'])
        
        db.session.add(user)
        db.session.flush()  # Get user ID
        
        # Assign plan
        plan = Plan.query.filter_by(name=user_data['plan_name']).first()
        if plan:
            subscription = Subscription(
                user_id=user.id,
                plan_id=plan.id,
                status='active',
                start_date=datetime.utcnow(),
                end_date=datetime.utcnow() + timedelta(days=30),
                searches_used=0
            )
            db.session.add(subscription)
    
    db.session.commit()
    print(f"Created {len(users_data)} sample users")

def create_sample_search_history():
    """Create sample search history for testing"""
    users = User.query.filter(User.email != 'admin@b2bveri.com').all()
    
    sample_queries = [
        'teknoloji şirketleri',
        'yazılım geliştirme',
        'e-ticaret',
        'dijital pazarlama',
        'fintech',
        'startup',
        'danışmanlık',
        'lojistik'
    ]
    
    import random
    
    for user in users:
        # Create 5-10 random searches for each user
        num_searches = random.randint(5, 10)
        
        for i in range(num_searches):
            query = random.choice(sample_queries)
            results_count = random.randint(10, 500)
            
            # Random date within last 30 days
            days_ago = random.randint(0, 30)
            search_date = datetime.utcnow() - timedelta(days=days_ago)
            
            search_history = SearchHistory(
                user_id=user.id,
                query=query,
                results_count=results_count,
                created_at=search_date
            )
            db.session.add(search_history)
    
    db.session.commit()
    print(f"Created sample search history for {len(users)} users")

if __name__ == '__main__':
    print("B2B Veri Database Initialization")
    print("=" * 40)
    
    # Confirm before proceeding
    print("This will drop all existing data. Continue? (y/N): y")
    response = 'y'  # Auto-confirm for automated setup
    if response.lower() != 'y':
        print("Initialization cancelled.")
        sys.exit(0)
    
    try:
        init_database()
        create_sample_search_history()
        
        print("\n" + "=" * 40)
        print("Database initialization completed!")
        print("\nSample accounts created:")
        print("Admin: admin@b2bveri.com / admin123")
        print("Test User: test@example.com / test123")
        print("Demo User: demo@company.com / demo123")
        print("\nYou can now start the application with: python app_saas_main.py")
        
    except Exception as e:
        print(f"\nError during initialization: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)