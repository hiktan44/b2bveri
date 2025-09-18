from flask import Blueprint, request, jsonify, redirect, url_for, flash, current_app, render_template
from flask_login import login_required, current_user
from models import db, User, Subscription, SubscriptionPlan
from datetime import datetime, timedelta
import stripe
import json
import hmac
import hashlib
from email_utils import send_subscription_notification

payment_bp = Blueprint('payment', __name__, url_prefix='/payment')

def init_stripe():
    """Stripe'ı başlat"""
    stripe.api_key = current_app.config['STRIPE_SECRET_KEY']

@payment_bp.before_request
def before_request():
    """Her istekten önce Stripe'ı başlat"""
    init_stripe()

@payment_bp.route('/create-checkout-session', methods=['POST'])
@login_required
def create_checkout_session():
    """Stripe Checkout oturumu oluştur"""
    try:
        data = request.get_json()
        plan_id = data.get('plan_id')
        
        if not plan_id:
            return jsonify({'error': 'Plan ID gereklidir'}), 400
        
        # Planı bul
        plan = SubscriptionPlan.query.get(plan_id)
        if not plan or not plan.is_active:
            return jsonify({'error': 'Geçersiz plan'}), 404
        
        # Stripe müşterisi oluştur veya bul
        stripe_customer = None
        if current_user.subscription and current_user.subscription.stripe_customer_id:
            try:
                stripe_customer = stripe.Customer.retrieve(current_user.subscription.stripe_customer_id)
            except stripe.error.InvalidRequestError:
                stripe_customer = None
        
        if not stripe_customer:
            stripe_customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.get_full_name(),
                metadata={
                    'user_id': current_user.id,
                    'company': current_user.company_name or ''
                }
            )
        
        # Checkout oturumu oluştur
        checkout_session = stripe.checkout.Session.create(
            customer=stripe_customer.id,
            payment_method_types=['card'],
            line_items=[{
                'price': plan.stripe_price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=url_for('payment.success', _external=True) + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=url_for('auth.subscription', _external=True),
            metadata={
                'user_id': current_user.id,
                'plan_id': plan.id
            },
            subscription_data={
                'metadata': {
                    'user_id': current_user.id,
                    'plan_id': plan.id
                }
            },
            allow_promotion_codes=True,
            billing_address_collection='required'
        )
        
        return jsonify({
            'checkout_url': checkout_session.url,
            'session_id': checkout_session.id
        })
        
    except stripe.error.StripeError as e:
        current_app.logger.error(f'Stripe error: {e}')
        return jsonify({'error': 'Ödeme işlemi başlatılamadı'}), 500
    except Exception as e:
        current_app.logger.error(f'Checkout session error: {e}')
        return jsonify({'error': 'Bir hata oluştu'}), 500

@payment_bp.route('/success')
@login_required
def success():
    """Ödeme başarılı sayfası"""
    session_id = request.args.get('session_id')
    
    if session_id:
        try:
            # Checkout oturumunu doğrula
            checkout_session = stripe.checkout.Session.retrieve(session_id)
            
            if checkout_session.payment_status == 'paid':
                flash('Ödemeniz başarıyla tamamlandı! Aboneliğiniz aktifleştirildi.', 'success')
            else:
                flash('Ödeme işlemi tamamlanmadı. Lütfen tekrar deneyiniz.', 'warning')
                
        except stripe.error.StripeError as e:
            current_app.logger.error(f'Session verification error: {e}')
            flash('Ödeme durumu doğrulanamadı.', 'error')
    
    return render_template('payment/success.html')

@payment_bp.route('/cancel')
@login_required
def cancel():
    """Ödeme iptal sayfası"""
    flash('Ödeme işlemi iptal edildi.', 'info')
    return redirect(url_for('auth.subscription'))

@payment_bp.route('/manage-subscription')
@login_required
def manage_subscription():
    """Abonelik yönetimi"""
    if not current_user.subscription or not current_user.subscription.stripe_customer_id:
        flash('Aktif aboneliğiniz bulunmuyor.', 'error')
        return redirect(url_for('auth.subscription'))
    
    try:
        # Stripe Customer Portal oturumu oluştur
        portal_session = stripe.billing_portal.Session.create(
            customer=current_user.subscription.stripe_customer_id,
            return_url=url_for('auth.subscription', _external=True)
        )
        
        return redirect(portal_session.url)
        
    except stripe.error.StripeError as e:
        current_app.logger.error(f'Portal session error: {e}')
        flash('Abonelik yönetimi sayfası açılamadı.', 'error')
        return redirect(url_for('auth.subscription'))

@payment_bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    """Stripe webhook işleyicisi"""
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    endpoint_secret = current_app.config['STRIPE_WEBHOOK_SECRET']
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError:
        current_app.logger.error('Invalid payload in webhook')
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError:
        current_app.logger.error('Invalid signature in webhook')
        return 'Invalid signature', 400
    
    # Event türüne göre işlem yap
    try:
        if event['type'] == 'checkout.session.completed':
            handle_checkout_completed(event['data']['object'])
        
        elif event['type'] == 'customer.subscription.created':
            handle_subscription_created(event['data']['object'])
        
        elif event['type'] == 'customer.subscription.updated':
            handle_subscription_updated(event['data']['object'])
        
        elif event['type'] == 'customer.subscription.deleted':
            handle_subscription_deleted(event['data']['object'])
        
        elif event['type'] == 'invoice.payment_succeeded':
            handle_payment_succeeded(event['data']['object'])
        
        elif event['type'] == 'invoice.payment_failed':
            handle_payment_failed(event['data']['object'])
        
        else:
            current_app.logger.info(f'Unhandled event type: {event["type"]}')
    
    except Exception as e:
        current_app.logger.error(f'Webhook processing error: {e}')
        return 'Webhook processing failed', 500
    
    return 'Success', 200

def handle_checkout_completed(session):
    """Checkout tamamlandığında"""
    user_id = session['metadata'].get('user_id')
    plan_id = session['metadata'].get('plan_id')
    
    if not user_id or not plan_id:
        current_app.logger.error('Missing metadata in checkout session')
        return
    
    user = User.query.get(user_id)
    plan = SubscriptionPlan.query.get(plan_id)
    
    if not user or not plan:
        current_app.logger.error(f'User or plan not found: {user_id}, {plan_id}')
        return
    
    # Stripe aboneliğini al
    stripe_subscription = stripe.Subscription.retrieve(session['subscription'])
    
    # Mevcut aboneliği iptal et
    if user.subscription:
        user.subscription.status = 'canceled'
    
    # Yeni abonelik oluştur
    subscription = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        stripe_subscription_id=stripe_subscription.id,
        stripe_customer_id=session['customer'],
        status=stripe_subscription.status,
        current_period_start=datetime.fromtimestamp(stripe_subscription.current_period_start),
        current_period_end=datetime.fromtimestamp(stripe_subscription.current_period_end)
    )
    
    db.session.add(subscription)
    db.session.commit()
    
    # Bildirim e-postası gönder
    try:
        send_subscription_notification(user, subscription, 'created')
    except Exception as e:
        current_app.logger.error(f'Notification email error: {e}')
    
    current_app.logger.info(f'Subscription created for user {user.id}')

def handle_subscription_created(stripe_subscription):
    """Abonelik oluşturulduğunda"""
    user_id = stripe_subscription['metadata'].get('user_id')
    
    if not user_id:
        current_app.logger.error('Missing user_id in subscription metadata')
        return
    
    user = User.query.get(user_id)
    if not user:
        current_app.logger.error(f'User not found: {user_id}')
        return
    
    # Aboneliği güncelle
    subscription = Subscription.query.filter_by(
        stripe_subscription_id=stripe_subscription['id']
    ).first()
    
    if subscription:
        subscription.status = stripe_subscription['status']
        subscription.current_period_start = datetime.fromtimestamp(stripe_subscription['current_period_start'])
        subscription.current_period_end = datetime.fromtimestamp(stripe_subscription['current_period_end'])
        db.session.commit()

def handle_subscription_updated(stripe_subscription):
    """Abonelik güncellendiğinde"""
    subscription = Subscription.query.filter_by(
        stripe_subscription_id=stripe_subscription['id']
    ).first()
    
    if not subscription:
        current_app.logger.error(f'Subscription not found: {stripe_subscription["id"]}')
        return
    
    old_status = subscription.status
    subscription.status = stripe_subscription['status']
    subscription.current_period_start = datetime.fromtimestamp(stripe_subscription['current_period_start'])
    subscription.current_period_end = datetime.fromtimestamp(stripe_subscription['current_period_end'])
    
    db.session.commit()
    
    # Durum değişikliği bildirimi
    if old_status != subscription.status:
        try:
            if subscription.status == 'active':
                send_subscription_notification(subscription.user, subscription, 'renewed')
            elif subscription.status in ['canceled', 'unpaid']:
                send_subscription_notification(subscription.user, subscription, 'canceled')
        except Exception as e:
            current_app.logger.error(f'Notification email error: {e}')

def handle_subscription_deleted(stripe_subscription):
    """Abonelik silindiğinde"""
    subscription = Subscription.query.filter_by(
        stripe_subscription_id=stripe_subscription['id']
    ).first()
    
    if not subscription:
        current_app.logger.error(f'Subscription not found: {stripe_subscription["id"]}')
        return
    
    subscription.status = 'canceled'
    db.session.commit()
    
    # Bildirim e-postası
    try:
        send_subscription_notification(subscription.user, subscription, 'canceled')
    except Exception as e:
        current_app.logger.error(f'Notification email error: {e}')

def handle_payment_succeeded(invoice):
    """Ödeme başarılı olduğunda"""
    subscription_id = invoice.get('subscription')
    
    if not subscription_id:
        return
    
    subscription = Subscription.query.filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    
    if subscription:
        # Abonelik yenilendi
        try:
            send_subscription_notification(subscription.user, subscription, 'renewed')
        except Exception as e:
            current_app.logger.error(f'Notification email error: {e}')

def handle_payment_failed(invoice):
    """Ödeme başarısız olduğunda"""
    subscription_id = invoice.get('subscription')
    
    if not subscription_id:
        return
    
    subscription = Subscription.query.filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    
    if subscription:
        subscription.status = 'past_due'
        db.session.commit()
        
        # Ödeme hatası bildirimi (isteğe bağlı)
        current_app.logger.warning(f'Payment failed for subscription {subscription.id}')

@payment_bp.route('/plans')
def get_plans():
    """Aktif planları JSON olarak döndür"""
    plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price).all()
    
    plans_data = []
    for plan in plans:
        plans_data.append({
            'id': plan.id,
            'name': plan.name,
            'description': plan.description,
            'price': float(plan.price),
            'currency': plan.currency,
            'monthly_search_limit': plan.monthly_search_limit,
            'max_results_per_search': plan.max_results_per_search,
            'api_access': plan.api_access,
            'priority_support': plan.priority_support
        })
    
    return jsonify(plans_data)

@payment_bp.route('/current-subscription')
@login_required
def get_current_subscription():
    """Mevcut abonelik bilgilerini döndür"""
    subscription = current_user.subscription
    
    if not subscription:
        return jsonify({'subscription': None})
    
    return jsonify({
        'subscription': {
            'id': subscription.id,
            'plan_name': subscription.plan.name,
            'status': subscription.status,
            'current_period_start': subscription.current_period_start.isoformat(),
            'current_period_end': subscription.current_period_end.isoformat(),
            'days_remaining': subscription.days_remaining(),
            'is_active': subscription.is_active()
        }
    })