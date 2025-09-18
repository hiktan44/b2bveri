# Gerekli kütüphaneleri projemize dahil ediyoruz.
import requests  # Web sitelerine istek göndermek için
from bs4 import BeautifulSoup  # HTML içeriğini analiz etmek için
import pandas as pd  # Verileri tablo formatında işlemek ve CSV'ye kaydetmek için
from googlesearch import search  # Google'da otomatik arama yapmak için
import re  # E-posta adreslerini bulmak için metin içinde desen aramak (regex) için
import time # İstekler arasında kısa bir süre beklemek için

# --- AYARLAR BÖLÜMÜ ---
# Buradaki değerleri değiştirerek aramanızı özelleştirebilirsiniz.

# 1. Google'da yapılacak arama sorgusu.
# 'site:.myshopify.com' -> Sadece Shopify sitelerinde arama yapmasını sağlar.
# 'wholesale clothing' -> "Toptan giyim" anahtar kelimelerini arar.
ARAMA_SORGUSU = '"wholesale clothing" OR "B2B fashion" site:.myshopify.com'

# 2. Google'dan kaç adet sonuç (web sitesi) çekileceği.
# Not: Çok yüksek sayılar Google tarafından engellenmenize neden olabilir.
SONUC_SAYISI = 50

# 3. Toplanan verilerin kaydedileceği dosyanın adı.
CIKTI_DOSYASI = 'b2b_musteri_listesi.csv'
# --- AYARLAR BÖLÜMÜ SONU ---


def google_ile_site_bul(sorgu, sayi):
    """
    Belirtilen sorgu ile Google'da arama yapar ve bulunan web sitelerinin listesini döndürür.
    """
    print(f"[+] '{sorgu}' için Google'da arama başlatılıyor...")
    try:
        # googlesearch kütüphanesini kullanarak arama yapıyoruz.
        urls = list(search(sorgu, num_results=sayi, sleep_interval=2))
        print(f"[OK] {len(urls)} adet potansiyel web sitesi bulundu.")
        return urls
    except Exception as e:
        print(f"[HATA] Google araması sırasında bir hata oluştu: {e}")
        return []

def site_bilgilerini_getir(url):
    """
    Verilen bir web sitesine bağlanır, sayfa başlığını ve içindeki e-posta adreslerini bulur.
    """
    try:
        # Web sitesine istek gönderirken gerçek bir tarayıcı gibi görünmek için User-Agent ekliyoruz.
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=10) # 10 saniye içinde cevap gelmezse zaman aşımına uğrar.

        # Eğer siteye başarıyla bağlandıysak (status code 200)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Sayfa başlığını firma adı olarak alıyoruz.
            firma_adi = soup.title.string.strip() if soup.title else url
            
            # E-posta adreslerini bulmak için regular expression (regex) kullanıyoruz.
            # Sayfanın tüm metninde e-posta formatına uyan desenleri arar.
            email_regex = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
            emails = re.findall(email_regex, response.text)
            
            # Bulunan e-postaları teke indiriyoruz (aynı mail birden fazla geçebilir).
            unique_emails = list(set(emails))
            
            # Topladığımız bilgileri bir sözlük (dictionary) olarak döndürüyoruz.
            return {
                'Firma Adı': firma_adi,
                'Web Sitesi': url,
                'Bulunan E-postalar': ', '.join(unique_emails) if unique_emails else 'Bulunamadı'
            }
        else:
            return None # Siteye bağlanılamadıysa boş döndür.
    except Exception as e:
        # Herhangi bir hata (bağlantı hatası, zaman aşımı vb.) olursa None döndür.
        return None

def main():
    """
    Ana fonksiyon. Tüm işlemleri sırasıyla başlatır ve yönetir.
    """
    # 1. Adım: Google'dan potansiyel siteleri bul.
    web_siteleri = google_ile_site_bul(ARAMA_SORGUSU, SONUC_SAYISI)
    
    if not web_siteleri:
        print("[!] Hiç web sitesi bulunamadı. Program sonlandırılıyor.")
        return

    # 2. Adım: Her siteyi analiz et ve bilgileri topla.
    print("\n[+] Web siteleri analiz ediliyor...")
    sonuclar = []
    for i, site_url in enumerate(web_siteleri):
        print(f"  -> ({i+1}/{len(web_siteleri)}) {site_url} analiz ediliyor...")
        bilgi = site_bilgilerini_getir(site_url)
        
        # Eğer bir bilgi bulunduysa listeye ekle.
        if bilgi:
            sonuclar.append(bilgi)
            print(f"     [OK] E-posta: {bilgi['Bulunan E-postalar']}")
        else:
            print("     [HATA] Bu siteden bilgi alınamadı veya e-posta bulunamadı.")
        
        # Sunucuları yormamak ve engellenmemek için her istek arasında 1 saniye bekle.
        time.sleep(1)

    # 3. Adım: Toplanan verileri bir CSV dosyasına kaydet.
    if sonuclar:
        print(f"\n[+] Toplam {len(sonuclar)} adet firmadan bilgi toplandı.")
        print(f"[+] Veriler '{CIKTI_DOSYASI}' dosyasına kaydediliyor...")
        
        # pandas DataFrame oluşturarak verileri tablo haline getiriyoruz.
        df = pd.DataFrame(sonuclar)
        
        # DataFrame'i CSV dosyasına kaydediyoruz.
        # index=False -> satır numaralarını dosyaya yazmaz.
        # encoding='utf-8-sig' -> Türkçe karakterlerin Excel'de doğru görünmesini sağlar.
        df.to_csv(CIKTI_DOSYASI, index=False, encoding='utf-8-sig')
        
        print(f"[✓] İşlem başarıyla tamamlandı! '{CIKTI_DOSYASI}' dosyasını kontrol edebilirsiniz.")
    else:
        print("\n[!] Hiçbir firmadan e-posta bilgisi toplanamadı.")


# Bu standart bir Python yapısıdır. Kod doğrudan çalıştırıldığında main() fonksiyonunu çağırır.
if __name__ == "__main__":
    main()
