import requests
import json
from bling_service import SUPABASE_URL, SUPABASE_KEY

# --- CONFIGURAÇÃO DO USUÁRIO ---
USUARIO = "garaujo"
PIN = "6666"

# Transformação interna (mesma lógica do front)
EMAIL = f"{USUARIO}@portcasa.com.br"
PASSWORD = f"{PIN}"

def criar_usuario():
    print(f"👤 Criando usuário: {USUARIO} (PIN: {PIN})")
    
    url = f"{SUPABASE_URL}/auth/v1/signup"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "data": { "nome_exibicao": "Administrador" }
    }
    
    # Tenta criar (SignUp)
    r = requests.post(url, headers=headers, json=payload)
    
    if r.status_code == 200:
        print("✅ Usuário criado com sucesso!")
        print(f"👉 Login: {USUARIO}")
        print(f"👉 Senha: {PIN}")
    elif "User already registered" in r.text:
        print("⚠️ Usuário já existe. Tentando resetar senha...")
        # Se quiser implementar reset, precisa da API de Admin, mas geralmente
        # deletar o usuário no painel do Supabase é mais rápido para testes.
    else:
        print(f"❌ Erro: {r.text}")

if __name__ == "__main__":
    criar_usuario()