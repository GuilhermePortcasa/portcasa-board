import requests
import time
from bling_service import BlingService, SUPABASE_URL, SUPABASE_KEY

# Lojas para sincronizar
LOJAS = ["PORTFIO", "PORTCASA"]

def salvar_categorias(lote):
    if not lote: return
    headers = {
        "apikey": SUPABASE_KEY, 
        "Authorization": f"Bearer {SUPABASE_KEY}", 
        "Prefer": "resolution=merge-duplicates", 
        "Content-Type": "application/json"
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/categorias", headers=headers, json=lote)
    if r.status_code not in [200, 201, 204]:
        print(f"      ❌ Erro Supabase: {r.text}")
    else:
        print(f"      ✅ {len(lote)} categorias salvas.")

def sync_categorias():
    # Cache para evitar duplicidade de IDs entre lojas (se houver colisão, o primeiro vence)
    ids_processados = set()

    for loja in LOJAS:
        print(f"\n📂 Sincronizando Categorias: {loja}")
        service = BlingService(loja)
        
        try:
            # Endpoint de categorias de produtos
            for lote in service.get_all_pages("/categorias/produtos"):
                buffer = []
                
                for cat in lote:
                    cat_id = cat['id']
                    
                    if cat_id in ids_processados:
                        continue
                        
                    ids_processados.add(cat_id)
                    
                    buffer.append({
                        "id": cat_id,
                        "descricao": cat['descricao'],
                        "id_categoria_pai": cat.get('categoriaPai', {}).get('id')
                    })
                
                if buffer:
                    salvar_categorias(buffer)
                    
        except Exception as e:
            print(f"❌ Erro ao baixar categorias da {loja}: {e}")

if __name__ == "__main__":
    sync_categorias()