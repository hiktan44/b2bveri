# Gerekli kütüphaneleri projemize dahil ediyoruz.
from flask import Flask, render_template, request, jsonify, send_file
import requests
from bs4 import BeautifulSoup
import pandas as pd
from googlesearch import search
import re
import time
import io
import random
# SERP API için gerekli kütüphane
from serpapi import GoogleSearch

# --- AYARLAR BÖLÜMÜ ---
# Varsayılan değerler, arayüzden değiştirilebilir.
ARAMA_SORGUSU = '"wholesale clothing" OR "B2B fashion" site:.myshopify.com'
SONUC_SAYISI = 1000  # Sınırlama kaldırıldı, yüksek bir değer ayarlandı
CIKTI_DOSYASI = 'b2b_musteri_listesi.csv'
# --- AYARLAR BÖLÜMÜ SONU ---

app = Flask(__name__)

# Global bir değişken, toplanan verileri geçici olarak saklamak için
gecici_sonuclar = []

def google_ile_site_bul(sorgu, sayi, ulkeler=None):
    """
    Belirtilen sorgu ile Google'da arama yapar ve bulunan web sitelerinin listesini döndürür.
    Opsiyonel olarak belirli ülkelerle sınırlandırılabilir.
    SERP API kullanarak Google rate limiting sorununu aşar.
    """
    print(f"'[+] '{sorgu}' için Google'da arama başlatılıyor...'")
    try:
        # Ülke sınırlaması ekle
        ulke_sorgusu = ""
        ulke_kodu = None
        ulke_domain = "google.com"
        
        # Ülke kodları ve domain eşleştirmesi
        ulke_mapping = {
            'tr': {'code': 'tr', 'domain': 'google.com.tr', 'site_filter': 'site:.com.tr OR site:.tr'},
            'gb': {'code': 'gb', 'domain': 'google.co.uk', 'site_filter': 'site:.co.uk OR site:.uk'},
            'uk': {'code': 'gb', 'domain': 'google.co.uk', 'site_filter': 'site:.co.uk OR site:.uk'},
            'us': {'code': 'us', 'domain': 'google.com', 'site_filter': 'site:.com'},
            'de': {'code': 'de', 'domain': 'google.de', 'site_filter': 'site:.de'},
            'fr': {'code': 'fr', 'domain': 'google.fr', 'site_filter': 'site:.fr'},
            'it': {'code': 'it', 'domain': 'google.it', 'site_filter': 'site:.it'},
            'es': {'code': 'es', 'domain': 'google.es', 'site_filter': 'site:.es'},
            'nl': {'code': 'nl', 'domain': 'google.nl', 'site_filter': 'site:.nl'},
            'ca': {'code': 'ca', 'domain': 'google.ca', 'site_filter': 'site:.ca'},
            'au': {'code': 'au', 'domain': 'google.com.au', 'site_filter': 'site:.com.au OR site:.au'}
        }
        
        if ulkeler and len(ulkeler) > 0:
            ulke_kodu_raw = ulkeler[0].lower()
            if ulke_kodu_raw in ulke_mapping:
                ulke_info = ulke_mapping[ulke_kodu_raw]
                ulke_kodu = ulke_info['code']
                ulke_domain = ulke_info['domain']
                # Sorguya ülke spesifik site filtresi ekle
                sorgu = f"{sorgu} ({ulke_info['site_filter']})"
                print(f"[+] Arama şu ülke ile sınırlandırılıyor: {ulke_kodu} - Domain: {ulke_domain}")
            else:
                ulke_kodu = ulke_kodu_raw
                print(f"[+] Arama şu ülke ile sınırlandırılıyor: {ulke_kodu}")
            
            # Eski yöntem için de ülke sorgusunu hazırla (yedek olarak)
            ulke_kodlari = [f"country{kod.upper()}" for kod in ulkeler]
            ulke_sorgusu = " " + " OR ".join(ulke_kodlari)
            sorgu_yedek = sorgu + ulke_sorgusu
        else:
            sorgu_yedek = sorgu
        
        # SERP API kullanarak Google araması yap
        try:
            # SERP API'ye istek gönder
            print(f"[+] SERP API ile Google araması yapılıyor (en fazla {sayi} sonuç)...")
            params = {
                "engine": "google",
                "q": sorgu,
                "api_key": "5ffce37786b9614345c52a5dd91924fb77b7c04ea464d0ad2f2f9ad5ac26a640",  # SERP API anahtarı
                "num": sayi,  # Kullanıcının istediği sayıda sonuç getir, sınırlama yok
                "gl": ulke_kodu if ulke_kodu else "us",  # Ülke kodu, varsayılan olarak US
                "google_domain": ulke_domain,  # Ülkeye özel Google domain
                "hl": ulke_kodu if ulke_kodu else "en"  # Arayüz dili
            }
            
            search = GoogleSearch(params)
            data = search.get_dict()
            
            if "error" in data:
                print(f"[HATA] SERP API hatası: {data['error']}")
                raise Exception(data['error'])
                
            # Organik arama sonuçlarını al ve ülkeye göre filtrele
            urls = []
            if "organic_results" in data:
                for result in data["organic_results"]:
                    if "link" in result:
                        url = result["link"]
                        # Ülke filtrelemesi uygula
                        if ulkeler and len(ulkeler) > 0:
                            ulke_kodu_raw = ulkeler[0].lower()
                            if ulke_kodu_raw in ulke_mapping:
                                ulke_info = ulke_mapping[ulke_kodu_raw]
                                # URL'nin seçilen ülkeye ait olup olmadığını kontrol et
                                if ulke_kodu_raw == 'gb' or ulke_kodu_raw == 'uk':
                                    if any(domain in url for domain in ['.co.uk', '.uk', '.org.uk', '.ac.uk']):
                                        urls.append(url)
                                elif ulke_kodu_raw == 'tr':
                                    if any(domain in url for domain in ['.com.tr', '.tr', '.org.tr', '.edu.tr']):
                                        urls.append(url)
                                elif ulke_kodu_raw == 'de':
                                    if '.de' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'fr':
                                    if '.fr' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'it':
                                    if '.it' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'es':
                                    if '.es' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'nl':
                                    if '.nl' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'ca':
                                    if '.ca' in url:
                                        urls.append(url)
                                elif ulke_kodu_raw == 'au':
                                    if any(domain in url for domain in ['.com.au', '.au', '.org.au']):
                                        urls.append(url)
                                elif ulke_kodu_raw == 'us':
                                    if any(domain in url for domain in ['.com', '.org', '.net']) and not any(other in url for other in ['.co.uk', '.com.tr', '.de', '.fr', '.it', '.es', '.nl', '.ca', '.com.au']):
                                        urls.append(url)
                                else:
                                    urls.append(url)  # Bilinmeyen ülke kodları için tüm sonuçları ekle
                            else:
                                urls.append(url)  # Mapping'de olmayan ülkeler için tüm sonuçları ekle
                        else:
                            urls.append(url)  # Ülke seçilmemişse tüm sonuçları ekle
            
            print(f"'[OK] SERP API ile {len(urls)} adet ülkeye uygun web sitesi bulundu.'")
            return urls
            
        except Exception as serp_error:
            # SERP API başarısız olursa, yedek yönteme geç
            print(f"[UYARI] SERP API ile arama başarısız oldu: {serp_error}")
            print("[+] Yedek arama yöntemine geçiliyor...")
            
            # Yedek yöntem: Önceki Google arama yöntemi
            # Kullanıcının istediği sayıda sonuç getir
            max_sonuc_sayisi = sayi  # Kullanıcının istediği sayıda sonuç
            
            print(f"[+] Google araması yapılıyor (istenilen {max_sonuc_sayisi} sonuç)...")
            urls = list(search(sorgu_yedek, num_results=max_sonuc_sayisi, sleep_interval=60))
            
            # İlk aramada sonuç bulunamazsa, farklı bir yaklaşım dene
            if not urls:
                print("[!] İlk aramada sonuç bulunamadı, farklı bir yaklaşım deneniyor...")
                time.sleep(90)  # Daha uzun bekle
                # Sorguyu basitleştir
                basit_sorgu = sorgu_yedek.split(" site:")[0] if " site:" in sorgu_yedek else sorgu_yedek
                basit_sorgu = basit_sorgu.replace(" OR ", " ")  # OR operatörlerini kaldır
                print(f"[+] Basitleştirilmiş sorgu ile deneniyor: {basit_sorgu}")
                urls = list(search(basit_sorgu, num_results=max_sonuc_sayisi, sleep_interval=60))
            
            # Eğer daha fazla sonuç isteniyorsa ve ilk aramada sonuç bulunduysa, devam et
            if sayi > max_sonuc_sayisi and urls:
                print(f"[+] İlk {len(urls)} sonuç alındı, kalan sonuçlar için bekleniyor...")
                time.sleep(120)  # Rate limiting'i aşmak için 2 dakika bekle
                try:
                    # Kalan sonuçları almak için ikinci bir arama yap
                    kalan_sonuc = sayi - max_sonuc_sayisi  # Kalan tüm sonuçları iste
                    print(f"[+] İkinci arama yapılıyor (kalan {kalan_sonuc} sonuç)...")
                    ikinci_urls = list(search(sorgu_yedek, num_results=kalan_sonuc, sleep_interval=60, 
                                             start=max_sonuc_sayisi))
                    urls.extend(ikinci_urls)
                except Exception as e:
                    print(f"[UYARI] Ek arama sırasında hata oluştu, mevcut sonuçlarla devam ediliyor: {e}")
            
            print(f"'[OK] Yedek yöntem ile {len(urls)} adet potansiyel web sitesi bulundu.'")
            return urls
            
    except Exception as e:
        print(f"[HATA] Google araması sırasında bir hata oluştu: {e}")
        # Hata mesajını analiz et
        hata_str = str(e)
        if "429" in hata_str or "Too Many Requests" in hata_str:
            print("[!] Google rate limiting nedeniyle arama yapılamıyor. Lütfen birkaç saat bekleyip tekrar deneyin.")
            print("[!] Alternatif olarak daha az sonuç sayısı (5-10) ile deneyebilirsiniz.")
            print("[!] Ya da SERP API anahtarı ekleyerek rate limiting sorununu aşabilirsiniz.")
        return []

def site_bilgilerini_getir(url):
    """
    Verilen bir web sitesine bağlanır, sayfa başlığını ve içindeki e-posta adreslerini bulur.
    """
    try:
        # Farklı User-Agent'lar kullanarak engellenmekten kaçınalım
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0'
        ]
        
        headers = {'User-Agent': random.choice(user_agents)}
        print(f"[+] {url} sitesine bağlanılıyor...")
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            firma_adi = soup.title.string.strip() if soup.title else url
            
            # E-posta adresi bulma yöntemlerini geliştirelim
            email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
            emails = []
            
            # 1. Doğrudan HTML içeriğinde arama
            emails.extend(re.findall(email_regex, response.text))
            
            # 2. 'mailto:' bağlantılarını kontrol etme
            for link in soup.find_all('a'):
                href = link.get('href', '')
                if href.startswith('mailto:'):
                    email = href.replace('mailto:', '').split('?')[0].strip()
                    if re.match(email_regex, email):
                        emails.append(email)
            
            # 3. İletişim sayfasını bulma ve orada arama
            contact_links = []
            for link in soup.find_all('a'):
                href = link.get('href', '')
                text = link.text.lower()
                if any(keyword in text for keyword in ['contact', 'iletişim', 'contact us', 'bize ulaşın']):
                    if href.startswith('/'):
                        contact_links.append(url.rstrip('/') + href)
                    elif href.startswith('http'):
                        contact_links.append(href)
                    else:
                        contact_links.append(url.rstrip('/') + '/' + href.lstrip('/'))
            
            # İletişim sayfalarını ziyaret et
            for contact_url in contact_links[:2]:  # En fazla 2 iletişim sayfasını kontrol et
                try:
                    contact_response = requests.get(contact_url, headers=headers, timeout=8)
                    if contact_response.status_code == 200:
                        contact_emails = re.findall(email_regex, contact_response.text)
                        emails.extend(contact_emails)
                        
                        # İletişim sayfasındaki mailto bağlantılarını da kontrol et
                        contact_soup = BeautifulSoup(contact_response.content, 'html.parser')
                        for link in contact_soup.find_all('a'):
                            href = link.get('href', '')
                            if href.startswith('mailto:'):
                                email = href.replace('mailto:', '').split('?')[0].strip()
                                if re.match(email_regex, email):
                                    emails.append(email)
                except:
                    pass  # İletişim sayfası açılamazsa sessizce devam et
            
            # Benzersiz e-postaları al
            unique_emails = list(set(emails))
            
            # E-posta adreslerini filtrele (örneğin example@example.com, no-reply gibi adresleri çıkar)
            filtered_emails = []
            for email in unique_emails:
                if not any(exclude in email.lower() for exclude in ['example', 'no-reply', 'noreply', 'donotreply']):
                    filtered_emails.append(email)
            
            return {
                'Firma Adı': firma_adi,
                'Web Sitesi': url,
                'Bulunan E-postalar': ', '.join(filtered_emails) if filtered_emails else 'Bulunamadı'
            }
        else:
            return None
    except Exception as e:
        print(f"[HATA] {url} sitesinden bilgi alınırken hata: {e}")
        return None

@app.route('/')
def landing():
    """SaaS tanıtım ana sayfasını gösterir."""
    return render_template('landing.html')

@app.route('/register')
def register():
    """Kayıt sayfasını gösterir."""
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Giriş sayfasını gösterir ve giriş işlemini yapar."""
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        # Basit demo giriş kontrolü
        if email and password:
            # Demo için basit kontrol (gerçek uygulamada veritabanı kontrolü yapılır)
            if email == 'demo@b2bveri.com' and password == 'demo123':
                # Başarılı giriş - uygulama sayfasına yönlendir
                return jsonify({
                    'success': True,
                    'message': 'Giriş başarılı! Yönlendiriliyorsunuz...',
                    'redirect': '/app'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': 'E-posta veya şifre hatalı!'
                })
        else:
            return jsonify({
                'success': False,
                'message': 'Lütfen tüm alanları doldurun!'
            })
    
    return render_template('login.html')

@app.route('/app')
def app_page():
    """B2B Veri Toplayıcı uygulama sayfasını gösterir."""
    return render_template('app.html')

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/run', methods=['POST'])
def run_scraper():
    """Arayüzden gelen istek üzerine veri toplama işlemini başlatır."""
    global gecici_sonuclar
    gecici_sonuclar = [] # Her yeni aramada sonuçları sıfırla

    data = request.get_json()
    sorgu = data.get('sorgu', ARAMA_SORGUSU)
    sayi = int(data.get('sayi', SONUC_SAYISI))
    ulkeler = data.get('ulkeler', [])

    # Google'da arama yap
    web_siteleri = google_ile_site_bul(sorgu, sayi, ulkeler)
    if not web_siteleri:
        return jsonify({
            'error': 'Hiç web sitesi bulunamadı.',
            'message': 'Google arama sınırlaması nedeniyle sonuç alınamadı. Lütfen birkaç dakika bekleyip tekrar deneyin veya daha az sonuç sayısı isteyin.'
        })

    print(f"[+] {len(web_siteleri)} adet web sitesi bulundu, bilgiler toplanıyor...")
    # Her site için bilgi topla
    for i, site_url in enumerate(web_siteleri):
        print(f"[+] {i+1}/{len(web_siteleri)}: {site_url} sitesi işleniyor...")
        bilgi = site_bilgilerini_getir(site_url)
        if bilgi:
            gecici_sonuclar.append(bilgi)
            print(f"[OK] {site_url} sitesinden bilgiler başarıyla alındı.")
        else:
            print(f"[UYARI] {site_url} sitesinden bilgi alınamadı.")
        
        # Siteler arasında daha uzun süre bekle (3-8 saniye)
        bekleme_suresi = random.uniform(3, 8)
        print(f"[+] Sonraki site için {bekleme_suresi:.1f} saniye bekleniyor...")
        time.sleep(bekleme_suresi)

    if not gecici_sonuclar:
        return jsonify({
            'error': 'Hiçbir firmadan e-posta bilgisi toplanamadı.',
            'message': 'Bulunan web sitelerinden e-posta adresleri çıkarılamadı. Farklı arama sorgusu deneyebilirsiniz.'
        })

    print(f"[OK] Toplam {len(gecici_sonuclar)} firmadan bilgi toplandı.")
    return jsonify(gecici_sonuclar)

@app.route('/download')
def download_file():
    """Toplanan verileri CSV olarak indirir."""
    global gecici_sonuclar
    if not gecici_sonuclar:
        return "İndirilecek veri bulunamadı.", 404

    df = pd.DataFrame(gecici_sonuclar)
    # Veriyi hafızada bir CSV dosyasına yaz
    output = io.BytesIO()
    df.to_csv(output, index=False, encoding='utf-8-sig')
    output.seek(0)

    return send_file(
        output,
        mimetype='text/csv',
        as_attachment=True,
        download_name=CIKTI_DOSYASI
    )

if __name__ == "__main__":
    app.run(debug=True, port=5001)
