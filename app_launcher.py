# Masaüstü uygulaması başlatıcı script
import os
import sys
import threading
import time
import webbrowser
from app import app

def open_browser():
    """Flask uygulaması başladıktan sonra tarayıcıyı açar"""
    # Uygulamanın başlaması için kısa bir süre bekle
    time.sleep(1.5)
    # Tarayıcıyı aç
    webbrowser.open('http://127.0.0.1:5001')

def run_app():
    """Flask uygulamasını başlatır"""
    # PyInstaller ile paketlendiğinde kaynak dosyaların yolunu ayarla
    if getattr(sys, 'frozen', False):
        # PyInstaller ile paketlenmiş uygulama
        template_folder = os.path.join(sys._MEIPASS, 'templates')
        app.template_folder = template_folder
        # Çalışma dizinini ayarla
        os.chdir(os.path.dirname(sys.executable))
    
    # Tarayıcıyı açmak için bir thread başlat
    threading.Thread(target=open_browser).start()
    
    # Flask uygulamasını başlat
    app.run(debug=False, port=5001)

if __name__ == "__main__":
    run_app()