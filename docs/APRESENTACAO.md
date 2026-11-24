# Material de apresentação acadêmica — FacePonto

## 1. Arquitetura do sistema

O sistema tem três camadas, organizadas no modelo **cliente-servidor**:

```
┌──────────────────────────── NAVEGADOR (Chrome/Edge) ─────────────────────────────┐
│  FRONTEND — React 19 + Vite  (http://localhost:5173)                              │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐ ┌─────────────┐  │
│  │ Dashboard   │ │ Funcionários │ │ Reconhecim.  │ │ Reg. Ponto│ │ Histórico   │  │
│  └─────────────┘ └──────────────┘ └──────┬───────┘ └─────┬─────┘ └─────────────┘  │
│         Componente Webcam (getUserMedia) ─┘  captura JPEG│base64                  │
│         services/api.js  ── fetch() + JSON + token JWT ──┘                        │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ HTTP/REST (JSON)   /api/*  (proxy do Vite)
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│  BACKEND — Python 3.12 + FastAPI + Uvicorn  (http://localhost:8000)              │
│  main.py ─ rotas REST, validação (schemas.py / Pydantic), tratamento de erros    │
│  security.py ─ JWT de sessão, token de reconhecimento (90 s, uso único), limite  │
│  recognition.py ─ validação da imagem + DeepFace (detecção, alinhamento,         │
│                   embedding Facenet512, distância cosseno, limite, ambiguidade)  │
│  ponto.py ─ regras de sequência e anti-duplicidade                               │
│  storage.py ─ fotos em uploads/fotos/ (UUID, sem EXIF, não públicas)             │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │ SQLAlchemy (ORM)
┌───────────────────────────────────▼───────────────────────────────────────────────┐
│  SQLite — data/ponto.db   tabelas: funcionarios  1 ───< N  registros_ponto        │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Por que separar frontend e backend?** O React só cuida da interface. Ele não acessa o banco nem roda IA. O Python concentra as regras, a segurança e o reconhecimento facial. Com isso, a lógica crítica (validar o rosto, impedir fraude no ponto) fica no servidor, onde o usuário não consegue alterá-la.

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Para que serve no projeto |
|---|---|---|
| Interface | **React 19** | Componentes reutilizáveis (Webcam, Layout, tabelas) e estado da tela |
| Build/servidor dev | **Vite 8** | Servidor rápido, *hot reload* e proxy `/api` → backend |
| Rotas | **React Router 7** | Navegação entre as telas pelo menu lateral |
| Ícones | **lucide-react** | Ícones vetoriais da interface |
| Câmera | **MediaDevices.getUserMedia** (API do navegador) | Exibir a webcam e capturar o quadro em `<canvas>` → JPEG |
| Foto/celular | `<input type="file" capture>` + `createImageBitmap` | Enviar foto da galeria ou tirar foto com a câmera nativa, corrigindo a rotação EXIF |
| HTTPS local | **@vitejs/plugin-basic-ssl** | Certificado local para a câmera ao vivo do celular na rede Wi-Fi |
| API | **FastAPI** + **Uvicorn** | Endpoints REST, validação automática e documentação em `/docs` |
| Validação | **Pydantic 2** | Regras de nome, matrícula e cargo; formato das respostas |
| ORM | **SQLAlchemy 2** | Mapeia as tabelas em classes Python e evita SQL injection |
| Banco | **SQLite** | Banco em arquivo único, sem instalação, ideal para demonstração |
| IA | **DeepFace 0.0.105** (TensorFlow 2.21) | Detecção, alinhamento e reconhecimento facial |
| Visão computacional | **OpenCV** | Leitura da imagem, brilho, nitidez (Laplaciano), detector Haar |
| Segurança | **PyJWT** | Tokens de sessão e de reconhecimento assinados (HS256) |
| Testes | **pytest** + TestClient | 19 testes automatizados com o DeepFace real |

## 3. Como funciona o DeepFace

O **DeepFace** é uma biblioteca Python de código aberto que reúne vários modelos de reconhecimento facial (VGG-Face, Facenet, Facenet512, ArcFace...) e vários detectores de rosto em uma interface única. O reconhecimento é feito em quatro etapas:

1. **Detecção**: localiza o rosto na imagem. Usamos o detector `opencv` (Haar Cascade), que já vem com o OpenCV e não precisa de download. O DeepFace devolve a região do rosto (`x, y, w, h`), a posição dos olhos e uma confiança.
2. **Alinhamento**: gira a imagem para deixar os olhos na horizontal (`align=True`). Assim, a inclinação da cabeça não atrapalha a comparação.
3. **Representação (embedding)**: o rosto recortado (160×160) passa pela rede neural convolucional **Facenet512** (Google, treinada com *triplet loss*). A saída é um **vetor de 512 números** que resume as características do rosto. Rostos da mesma pessoa geram vetores próximos; pessoas diferentes geram vetores distantes.
4. **Verificação**: compara dois vetores com uma **métrica de distância**. Usamos a **distância do cosseno**: `1 − (A·B)/(‖A‖·‖B‖)`. O valor 0 significa vetores idênticos. Se a distância for **≤ 0,30** (limite oficial do DeepFace para Facenet512 + cosseno), é a mesma pessoa.

**Por que Facenet512?** Nos benchmarks do próprio DeepFace, ele está entre os modelos mais precisos, roda bem em CPU (sem placa de vídeo) e tem pesos de apenas cerca de 95 MB.

**Medidas que tomamos contra identificação incorreta:**
- limite de distância rigoroso (0,30);
- **margem de ambiguidade**: se o 2º funcionário mais parecido estiver a menos de 0,05 do 1º, o resultado é recusado;
- exatamente **um** rosto na imagem, com tamanho mínimo e confiança de detecção ≥ 0,80;
- checagem de **iluminação** (brilho médio) e de **nitidez** (variância do Laplaciano no rosto);
- no cadastro, o sistema recusa um rosto que já pertence a outra matrícula;
- o ponto só é gravado com o **token de reconhecimento** (90 s, uso único).

Resultados medidos nos testes, com fotos diferentes da mesma pessoa e de pessoas diferentes:

| Comparação | Distância | Decisão |
|---|---|---|
| Pessoa A (foto de cadastro × outra foto) | 0,155 | ✅ reconhecida (≤ 0,30) |
| Pessoa C (não cadastrada) × cadastro mais próximo | 0,660 | ❌ recusada |

## 4. Fluxo do reconhecimento facial

```
 Usuário            React (navegador)                  FastAPI (Python)                    DeepFace / SQLite
   │  olha p/ câmera     │                                    │                                   │
   │────────────────────►│ getUserMedia → <video> ao vivo     │                                   │
   │  clica "Reconhecer" │ canvas.drawImage → JPEG base64     │                                   │
   │                     │── POST /api/reconhecimento ───────►│ 1. valida base64, JPEG/PNG,       │
   │                     │   {imagem: "data:image/jpeg..."}   │    tamanho ≤5MB, resolução        │
   │                     │                                    │ 2. brilho (escura/estourada)      │
   │                     │                                    │ 3. DeepFace.represent() ─────────►│ detecta, alinha,
   │                     │                                    │◄──────── embedding 512-d ─────────│ Facenet512
   │                     │                                    │ 4. 0 rostos? >1 rosto? pequeno?   │
   │                     │                                    │    desfocado? → erro 422          │
   │                     │                                    │ 5. carrega embeddings ───────────►│ SQLite
   │                     │                                    │ 6. distância cosseno com todos,   │
   │                     │                                    │    menor ≤ 0,30 e sem ambiguidade │
   │                     │◄── {reconhecido, funcionario,      │ 7. gera token_registro (90 s)     │
   │                     │     distancia, proximos_tipos,     │    e tipos permitidos agora       │
   │                     │     token_registro}                │                                   │
   │ escolhe "Entrada"   │── POST /api/ponto ────────────────►│ 8. valida token + sequência +     │
   │                     │   {token_registro, tipo}           │    duplicidade + intervalo        │
   │                     │                                    │ 9. INSERT registros_ponto ───────►│ SQLite
   │◄── "Ponto registrado│◄── {nome, matricula, data,         │                                   │
   │     às 08:01:12"    │     horario, tipo}                 │                                   │
```

**Cadastro de funcionário:** o fluxo é parecido. A foto passa pelas mesmas validações. O embedding é calculado **uma vez** e salvo no banco, junto com a foto (arquivo JPEG com nome aleatório). Depois, cada reconhecimento só precisa calcular o embedding da foto nova e comparar com os já salvos. A comparação 1:N fica rápida, porque não é preciso reprocessar as fotos cadastradas.

## 5. Comunicação entre React e Python

- **Protocolo:** HTTP com **API REST** e **JSON** nos dois sentidos. Os verbos seguem o padrão: `GET` (consultar), `POST` (criar), `PUT` (atualizar), `DELETE` (excluir).
- **Imagem:** o React converte o quadro da webcam em **JPEG base64 (data URL)** e envia dentro do JSON. O backend decodifica e valida a imagem antes de entregá-la ao DeepFace.
- **Proxy:** o navegador chama `http://localhost:5173/api/...` e o Vite repassa para `http://127.0.0.1:8000`. Assim os dois parecem estar na mesma origem. O CORS também está configurado no FastAPI para essa origem.
- **Autenticação:** após o login, o React guarda o **JWT** na `sessionStorage` e o envia em `Authorization: Bearer <token>`. Se receber 401, a tela volta ao login.
- **Erros:** o backend sempre devolve `{"detail": "...", "codigo": "..."}` em português. O React exibe a mensagem em *toasts* ou alertas, e o código (ex.: `SEM_ROSTO`) permite reações específicas.
- **Documentação viva:** em <http://localhost:8000/docs> (Swagger, gerado pelo FastAPI) é possível testar cada endpoint durante a apresentação.

## 6. Banco de dados

```
┌──────────────────────── funcionarios ────────────────────────┐
│ id               INTEGER  PK autoincrement                    │
│ nome             VARCHAR(120)  NOT NULL                       │
│ matricula        VARCHAR(20)   NOT NULL UNIQUE (índice)       │
│ cargo            VARCHAR(80)   NOT NULL                       │
│ foto_path        VARCHAR(255)  NOT NULL  (nome do arquivo)    │
│ data_cadastro    DATETIME      NOT NULL                       │
│ embedding        BLOB          NOT NULL  (512 × float32)      │
│ modelo_embedding VARCHAR(40)   NOT NULL  ("Facenet512")       │
└───────────────────────────┬───────────────────────────────────┘
                            │ 1
                            │
                            │ N
┌───────────────────────────▼─────── registros_ponto ──────────┐
│ id               INTEGER  PK autoincrement                    │
│ funcionario_id   INTEGER  FK → funcionarios.id                │
│                           ON DELETE CASCADE (índice)          │
│ data             DATE     NOT NULL (índice)                   │
│ horario          TIME     NOT NULL                            │
│ tipo             ENUM(ENTRADA, SAIDA_INTERVALO,               │
│                       RETORNO_INTERVALO, SAIDA_FINAL)         │
│ distancia        FLOAT    (auditoria do reconhecimento)       │
│ UNIQUE (funcionario_id, data, tipo)  ← impede duplicidade     │
└───────────────────────────────────────────────────────────────┘
```

- **Relacionamento 1:N:** um funcionário tem vários registros. A chave estrangeira é ativada no SQLite com `PRAGMA foreign_keys=ON`.
- **Nome e matrícula** não são copiados no registro: vêm do relacionamento (normalização). Se o nome for corrigido, o histórico já mostra o nome atualizado.
- **Integridade:** `UNIQUE(matricula)` e `UNIQUE(funcionario_id, data, tipo)` garantem as regras mesmo que a aplicação falhe.
- **Exclusão:** `ON DELETE CASCADE` remove os registros, e o backend apaga a foto do disco. Isso atende ao direito de eliminação da LGPD.

## 7. Roteiro sugerido para a apresentação (cerca de 15 min)

| Tempo | O que mostrar | Dica |
|---|---|---|
| 0:00–1:30 | **Problema e objetivo:** ponto manual é sujeito a fraude ("bater o ponto do colega"); a proposta é a identificação facial | Comece pela motivação |
| 1:30–3:30 | **Arquitetura** (diagrama da seção 1) e **tecnologias** | Destaque que a IA roda no servidor |
| 3:30–5:00 | **DeepFace**: detecção → alinhamento → embedding 512-d → distância cosseno ≤ 0,30 | Use a tabela de distâncias da seção 3 |
| 5:00–7:00 | **Demo 1 — Cadastro:** cadastrar um colega pela webcam e mostrar a ficha | Deixe já cadastrado quem vai demonstrar o ponto |
| 7:00–10:00 | **Demo 2 — Ponto:** registrar Entrada → Saída intervalo → Retorno → Saída final. Mostrar que os botões fora da sequência ficam bloqueados | Use `INTERVALO_MINIMO_SEGUNDOS=5` no `.env` para a demo |
| 10:00–11:30 | **Demo 3 — Segurança:** (a) pessoa não cadastrada → recusada; (b) duas pessoas na câmera → recusado; (c) cobrir a câmera → "imagem escura"; (d) tentar registrar Entrada de novo → "registro duplicado" | É a parte que mais impressiona |
| 11:30–12:30 | **Histórico e Dashboard:** filtros por data, matrícula e tipo; espelho de ponto; CSV | |
| 12:30–13:30 | **Banco de dados:** abrir `data/ponto.db` no *DB Browser for SQLite* e mostrar as tabelas e a FK; reiniciar o backend e mostrar que os dados persistem | Também dá para mostrar `/docs` |
| 13:30–14:00 | **Demo 4 — Celular:** abrir o sistema no celular (`npm run celular`), reconhecer pela câmera do celular e mostrar no histórico a marcação "Foto enviada" de um registro feito por foto | Teste a rede Wi-Fi da sala antes |
| 14:00–14:30 | **LGPD e limitações** (seção 8) | Mostra maturidade |
| 14:30–15:00 | **Conclusão** e perguntas | |

**Checklist antes da apresentação:** rodar `python -m pytest` (todos verdes); abrir o backend e esperar "DeepFace pronto"; testar a câmera no notebook da sala; ter boa iluminação frontal; deixar 2 ou 3 funcionários cadastrados; levar o projeto também em um pendrive.

**Perguntas prováveis do professor e respostas curtas:**
- *"E se mostrarem uma foto no celular?"* → O sistema não tem detecção de vivacidade (*liveness*). O DeepFace oferece `anti_spoofing=True` (modelo FasNet, exige PyTorch). Essa é a principal evolução proposta.
- *"Por que 0,30?"* → É o limite calibrado pelo DeepFace para Facenet512 + cosseno. Pode ser ajustado no `.env`: valor menor dá menos falsos positivos e mais recusas.
- *"Por que guardar o embedding?"* → Para não reprocessar todas as fotos a cada reconhecimento. O embedding é dado biométrico e nunca sai do servidor.
- *"Por que o celular precisa de HTTPS?"* → Por segurança, os navegadores só liberam a câmera ao vivo em páginas HTTPS ou em `localhost`. O modo celular gera um certificado local. O botão "Tirar foto" usa a câmera nativa e não tem essa exigência.
- *"Foto enviada não facilita fraude?"* → Sim. Por isso a origem fica registrada para auditoria e o recurso pode ser desligado (`PERMITIR_FOTO_ARQUIVO=false`).
- *"Escala para muitos funcionários?"* → A comparação é linear e leva microssegundos por cadastro. Para milhares de pessoas, um índice vetorial (FAISS) seria o próximo passo.

## 8. Limitações e melhorias futuras

- Detecção de vivacidade (*anti-spoofing*) contra fotos e vídeos.
- Mais de uma foto por funcionário (ângulos e iluminações diferentes) para maior robustez.
- Jornadas noturnas que atravessam a meia-noite e múltiplos intervalos por dia.
- Perfis de usuário (RH, gestor), auditoria de quem editou cada dado e HTTPS em produção.
- Banco PostgreSQL e criptografia dos embeddings em repouso para ambientes reais.
- Conformidade com a Portaria 671/2021 do MTE (REP-P) para uso trabalhista oficial.
