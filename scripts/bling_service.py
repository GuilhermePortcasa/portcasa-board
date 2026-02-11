import os
import requests
import base64
import time
import json
from datetime import datetime, timedelta

# Carrega variáveis de ambiente de forma inteligente
def load_env():
    # Caminhos onde o .env pode estar: na pasta atual ou na pasta pai
    possible_paths = [
        '.env', 
        '../.env', 
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), '..', '.env')
    ]
    
    found = False
    for path in possible_paths:
        if os.path.exists(path):
            with open(path, 'r') as f:
                for line in f:
                    if line.strip() and not line.startswith('#'):
                        key, value = line.strip().split('=', 1)
                        os.environ[key] = value.strip()
            found = True
            break
            
    if not found:
        print("⚠️ AVISO: Arquivo .env não encontrado em nenhum dos caminhos possíveis!")

load_env()

# Agora o os.environ.get vai funcionar!
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
        """Atualiza os tokens no Supabase após o refresh"""
        url = f"{SUPABASE_URL}/rest/v1/integracoes_bling?nome_loja=eq.{self.nome_loja}"
        requests.patch(url, headers=self.supabase_headers, json=new_data)

    def _refresh_token(self, refresh_token):
        """Pede um novo token para o Bling usando o refresh_token"""
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
            # Calcula nova expiração
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
        """Verifica se o token venceu e retorna um válido"""
        data = self._get_tokens_db()
        
        # --- CORREÇÃO DO ERRO DE DATA ---
        # 1. Lê a data do banco
        expires_at = datetime.fromisoformat(data['expires_at'].replace('Z', ''))
        
        # 2. Se ela tiver fuso horário (aware), remove para ficar igual ao datetime.now() (naive)
        if expires_at.tzinfo is not None:
            expires_at = expires_at.replace(tzinfo=None)
        # --------------------------------

        # Se faltam menos de 10 minutos para vencer, renova
        if datetime.now() > (expires_at - timedelta(minutes=10)):
            return self._refresh_token(data['refresh_token'])
        
        return data['access_token']

    def get_all_pages(self, endpoint, params=None):
        """
        Gerador que baixa TODAS as páginas de um endpoint.
        Lida com paginação e Rate Limit automaticamente.
        """
        if params is None: params = {}
        token = self.get_valid_token()
        headers = {"Authorization": f"Bearer {token}"}
        
        # --- CORREÇÃO AQUI: Pega a página dos params ou inicia em 1 ---
        pagina = params.get('pagina', 1)
        
        while True:
            self.current_page = pagina # Para podermos ler no script de carga
            params['pagina'] = pagina
            params['limite'] = 100
            
            try:
                print(f"📥 {self.nome_loja}: Baixando {endpoint} (Pág {pagina})...")
                resp = requests.get(f"{self.base_url}{endpoint}", headers=headers, params=params)
                
                if resp.status_code == 429:
                    print("⏳ Rate limit atingido. Esperando 2 segundos...")
                    time.sleep(2)
                    continue

                if resp.status_code != 200:
                    print(f"❌ Erro {resp.status_code}: {resp.text}")
                    break

                data = resp.json()
                items = data.get('data', [])
                
                if not items:
                    break

                yield items

                pagina += 1
                time.sleep(0.4)
                
            except Exception as e:
                print(f"Erro na requisição: {e}")
                time.sleep(5)