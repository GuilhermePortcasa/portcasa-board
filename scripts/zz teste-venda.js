// Rode no terminal: node teste-nfe.js
const nfeId = '25125754454'; // <--- Pegue um ID do resultado do SQL acima
const token = 'f51180c45c22416ce8612e52dce5601cb18a4e96'; 

async function getNfe() {
  const url = `https://www.bling.com.br/Api/v3/nfe/${nfeId}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (error) {
    console.error('Erro ao buscar NFe:', error);
  }
}

getNfe();