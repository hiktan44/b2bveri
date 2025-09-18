# B2B Veri Toplayıcı 🚀

Google araması yaparak B2B firmalarının iletişim bilgilerini toplayan profesyonel web uygulaması. Ülke bazlı kesin filtreleme ve gelişmiş veri çıkarma özellikleri ile donatılmıştır.

## ✨ Özellikler

### 🎯 Gelişmiş Arama
- **SERP API** entegrasyonu ile hızlı ve güvenilir arama
- **12 ülke** için özel filtreleme sistemi
- Ülkeye özel domain filtreleme (`.co.uk`, `.com.tr`, `.de` vb.)
- Rate limiting koruması

### 🌍 Desteklenen Ülkeler
- 🇹🇷 Türkiye
- 🇬🇧 İngiltere
- 🇺🇸 Amerika
- 🇩🇪 Almanya
- 🇫🇷 Fransa
- 🇮🇹 İtalya
- 🇪🇸 İspanya
- 🇳🇱 Hollanda
- 🇨🇦 Kanada
- 🇦🇺 Avustralya

### 📧 Akıllı E-posta Çıkarma
- HTML içeriğinden e-posta bulma
- `mailto:` bağlantılarını tarama
- İletişim sayfalarını otomatik bulma
- Spam e-postaları filtreleme

### 🎨 Modern Arayüz
- Responsive tasarım
- Bootstrap 5 ile modern UI
- Gerçek zamanlı progress gösterimi
- Kullanıcı dostu navigasyon

### 🔐 Güvenlik
- Kullanıcı girişi sistemi
- Session yönetimi
- CSRF koruması

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Python 3.7+
- pip

### Kurulum

1. **Repository'yi klonlayın:**
```bash
git clone https://github.com/kullaniciadi/b2bveri.git
cd b2bveri
```

2. **Gerekli kütüphaneleri yükleyin:**
```bash
pip install -r requirements.txt
```

3. **Uygulamayı çalıştırın:**
```bash
python app.py
```

4. **Tarayıcınızda açın:**
```
http://localhost:5001
```

## 📖 Kullanım

### Giriş Yapma
- **Demo Hesap:**
  - E-posta: `demo@b2bveri.com`
  - Şifre: `demo123`

### Veri Toplama
1. 🔍 Arama sorgunuzu girin
2. 🌍 Hedef ülkeyi seçin
3. 📊 Sonuç sayısını belirleyin
4. ▶️ "Aramayı Başlat" butonuna tıklayın
5. 📥 Sonuçları CSV olarak indirin

## 🛠️ Teknoloji Stack

- **Backend:** Flask (Python)
- **Frontend:** HTML5, CSS3, JavaScript, Bootstrap 5
- **Veri İşleme:** BeautifulSoup4, Pandas
- **API:** SERP API, Google Search
- **Veritabanı:** SQLite (geliştirme)

## 📁 Proje Yapısı

```
b2bveri/
├── app.py                 # Ana uygulama
├── templates/            # HTML şablonları
│   ├── landing.html     # Ana sayfa
│   ├── login.html       # Giriş sayfası
│   ├── register.html    # Kayıt sayfası
│   └── app.html         # Uygulama sayfası
├── static/              # CSS, JS, resimler
├── requirements.txt     # Python bağımlılıkları
└── README.md           # Bu dosya
```

## 🔧 Konfigürasyon

### SERP API Anahtarı
Daha iyi performans için kendi SERP API anahtarınızı `app.py` dosyasında güncelleyin:

```python
"api_key": "YOUR_SERP_API_KEY"
```

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📝 Lisans

MIT License - detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 📞 İletişim

- 📧 E-posta: info@b2bveri.com
- 🌐 Website: [b2bveri.com](https://b2bveri.com)

## ⭐ Yıldız Verin!

Bu proje işinize yaradıysa, lütfen ⭐ vererek destekleyin!