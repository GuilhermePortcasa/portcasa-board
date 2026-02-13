import os
import requests
import base64
import time
import json
from datetime import datetime, timedelta, timezone

# Carrega variáveis de ambiente
def load_env():
    possible_paths = [
        '.env', 
        '../.env', 
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), '..', '.env')
    ]
    
    found = False
    for path in possible_paths:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, value = line.strip().split('=', 1)
                        os.environ[key] = value.strip()
            found = True
            break
            
    if not found:
        print("⚠️ AVISO: Arquivo .env não encontrado!")

load_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

class BlingService:
    def __init__(self, nome_loja):
        self.nome_loja = nome_loja
        self.base_url = "https://www.bling.com.br/Api/v3"
        self.supabase_headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }

    def _get_tokens_db(self):
        """Busca os tokens salvos no Supabase"""
        url = f"{SUPABASE_URL}/rest/v1/integracoes_bling?nome_loja=eq.{self.nome_loja}&select=*"
        resp = requests.get(url, headers=self.supabase_headers)
        if resp.status_code == 200 and len(resp.json()) > 0:
            return resp.json()[0]
        raise Exception(f"Loja {self.nome_loja} não encontrada no banco.")

    def _update_tokens_db(self, new_data):
        """Atualiza os tokens no Supabase"""
        url = f"{SUPABASE_URL}/rest/v1/integracoes_bling?nome_loja=eq.{self.nome_loja}"
        requests.patch(url, headers=self.supabase_headers, json=new_data)

    def _refresh_token(self, refresh_token):
        """Força a renovação do token junto ao Bling"""
        print(f"🔄 Renovando token para {self.nome_loja}...")
        client_id = os.environ.get(f"BLING_CLIENT_ID_{self.nome_loja}")
        client_secret = os.environ.get(f"BLING_SECRET_{self.nome_loja}")
        
        credenciais = f"{client_id}:{client_secret}"
        auth_header = base64.b64encode(credenciais.encode()).decode()

        resp = requests.post(
            f"{self.base_url}/oauth/token",
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token
            }
        )

        if resp.status_code == 200:
            data = resp.json()
            expires_at = datetime.now() + timedelta(seconds=data['expires_in'])
            
            new_db_data = {
                "access_token": data['access_token'],
                "refresh_token": data['refresh_token'],
                "expires_at": expires_at.isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            self._update_tokens_db(new_db_data)
            return data['access_token']
        else:
            raise Exception(f"Erro ao renovar token: {resp.text}")

    def get_valid_token(self):
        """Retorna um token válido, renovando se necessário (buffer de 5 min)"""
        data = self._get_tokens_db()
        expires_at_str = data['expires_at'].replace('Z', '+00:00')
        expires_at = datetime.fromisoformat(expires_at_str)

        # Garante comparação entre datas com fuso horário
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        agora = datetime.now(timezone.utc)

        # Se faltam menos de 5 minutos para expirar, renova
        if agora > (expires_at - timedelta(minutes=5)):
            return self._refresh_token(data['refresh_token'])
        
        return data['access_token']

    def get_all_pages(self, endpoint, params=None):
        """Gerador de páginas com auto-cura para tokens expirados"""
        if params is None: params = {}
        pagina = params.get('pagina', 1)
        
        while True:
            # BUSCA TOKEN NOVO A CADA PÁGINA (Essencial!)
            token = self.get_valid_token()
            headers = {"Authorization": f"Bearer {token}"}
            
            params['pagina'] = pagina
            params['limite'] = 100
            
            try:
                print(f"📥 {self.nome_loja}: Baixando {endpoint} (Pág {pagina})...")
                resp = requests.get(f"{self.base_url}{endpoint}", headers=headers, params=params)
                
                # Caso o token expire EXATAMENTE entre a verificação e a chamada
                if resp.status_code == 401:
                    print("⚠️ Token invalidado durante a chamada. Tentando refresh forçado...")
                    data_db = self._get_tokens_db()
                    token = self._refresh_token(data_db['refresh_token'])
                    headers = {"Authorization": f"Bearer {token}"}
                    resp = requests.get(f"{self.base_url}{endpoint}", headers=headers, params=params)

                if resp.status_code == 429:
                    print("⏳ Rate limit atingido. Esperando 3 segundos...")
                    time.sleep(3)
                    continue

                if resp.status_code != 200:
                    print(f"❌ Erro {resp.status_code} na página {pagina}: {resp.text}")
                    break

                data = resp.json()
                items = data.get('data', [])
                
                if not items:
                    print(f"🏁 Fim da paginação em {endpoint}.")
                    break

                yield items

                pagina += 1
                time.sleep(0.3) # Delay entre páginas para respeitar o Bling
                
            except Exception as e:
                print(f"⚠️ Erro na requisição da pág {pagina}: {e}")
                time.sleep(5)
                continue