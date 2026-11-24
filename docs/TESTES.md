# Relatório de testes

Este relatório descreve **somente os testes que foram executados**, em que ambiente e com qual resultado. Os pontos que **não** puderam ser testados estão listados ao final.

## Ambiente em que os testes rodaram
| Item | Versão |
|---|---|
| Sistema | Linux (ambiente de desenvolvimento em nuvem) |
| Python | 3.13 · FastAPI 0.165 · DeepFace 0.0.105 · TensorFlow 2.21 · OpenCV 5.1 |
| Node.js | 22 · React 19.3 · Vite 8.3 |
| Navegador | Google Chrome (headless) controlado por Playwright |
| Câmera | **Webcam virtual do Chrome** (`--use-fake-device-for-media-stream`), alimentada com vídeos gerados a partir das imagens de teste |
| Imagens | AT&T Database of Faces (voluntários de pesquisa); veja `backend/tests/fixtures/CREDITOS.txt` |

A instalação de `requirements.txt` também foi verificada em um ambiente virtual **novo e vazio**: `pip install -r requirements.txt` terminou sem erros e `pip check` não apontou conflitos. Também foi confirmado no PyPI que existem pacotes Windows 64 bits (`win_amd64`) do TensorFlow 2.21 para Python 3.10–3.13.

## 1. Testes automatizados da API (pytest, DeepFace real)
Comando: `cd backend && python -m pytest -v`. Resultado: **22 passed**.

| # | Teste | O que verifica | Resultado |
|---|---|---|---|
| 1 | `test_endpoints_exigem_autenticacao` | Sem token, os endpoints retornam 401; senha errada é recusada | ✅ |
| 2 | `test_cadastro_armazena_foto_e_embedding` | Cadastro grava o funcionário, a foto JPEG no disco e o embedding de 512 floats; a API não expõe embedding nem caminho | ✅ |
| 3 | `test_cadastro_validacoes` | Matrícula duplicada (409), mesmo rosto com outra matrícula (409), nome incompleto (422), foto sem rosto (422) | ✅ |
| 4–7 | `test_reconhecimento_recusa_imagens_ruins` | Sem rosto → `SEM_ROSTO`; dois rostos → `VARIOS_ROSTOS`; escura → `IMAGEM_ESCURA`; desfocada → `IMAGEM_DESFOCADA` | ✅ |
| 8 | `test_imagem_invalida` | Arquivo que não é imagem e base64 inválido | ✅ |
| 9 | `test_reconhece_funcionarios_cadastrados` | Duas pessoas cadastradas são reconhecidas com **outra foto**, distância ≤ limite | ✅ |
| 10 | `test_recusa_funcionario_nao_cadastrado` | Pessoa não cadastrada: `reconhecido=false`, sem token, distância > limite | ✅ |
| 11 | `test_fluxo_completo_de_ponto` | Entrada → Saída intervalo → Retorno → Saída final, cada uma após novo reconhecimento; nada permitido depois | ✅ |
| 12 | `test_sequencias_invalidas_e_duplicadas` | Retorno como 1º registro, token reutilizado, entrada duplicada, retorno sem saída | ✅ |
| 13 | `test_intervalo_minimo_entre_registros` | Duas marcações em menos de 60 s → 429 | ✅ |
| 14 | `test_token_forjado_e_recusado` | Token falso ou token de sessão no lugar do token de reconhecimento | ✅ |
| 15 | `test_token_de_reconhecimento_expirado` | Token de reconhecimento vencido → "reconhecimento expirou" | ✅ |
| 16 | `test_historico_e_filtros` | Histórico geral, por funcionário, filtros por matrícula, tipo e data, período invertido, CSV e dashboard | ✅ |
| 17 | `test_editar_funcionario` | Edição de cargo; matrícula duplicada e foto de outra pessoa recusadas | ✅ |
| 18 | `test_persistencia_apos_reiniciar` | Fecha as conexões, lê o arquivo SQLite diretamente e sobe uma nova instância da aplicação | ✅ |
| 19 | `test_excluir_funcionario_remove_foto_e_registros` | Exclusão remove funcionário, foto do disco e registros; o rosto deixa de ser reconhecido | ✅ |
| 20 | `test_reconhecimento_por_foto_enviada_registra_origem` | Reconhecimento com `origem=arquivo` → registro gravado com origem "arquivo"; CSV mostra "Foto enviada"; registros da câmera continuam "camera" | ✅ |
| 21 | `test_foto_enviada_pode_ser_desativada` | Com `PERMITIR_FOTO_ARQUIVO=false`, foto enviada é recusada (403) e a câmera continua funcionando | ✅ |
| 22 | `test_migracao_de_banco_antigo` | Um banco da versão anterior (sem a coluna `origem`) é atualizado automaticamente ao iniciar | ✅ |

Distâncias medidas pelo DeepFace (Facenet512, cosseno, limite 0,30) com as imagens de teste:
- mesma pessoa, fotos diferentes: **0,155** (A) → reconhecida;
- pessoa não cadastrada contra o cadastro mais próximo: **0,660** → recusada.

## 2. Teste de ponta a ponta no navegador (React + FastAPI + SQLite + DeepFace)
Com o backend (`uvicorn`) e o frontend (`vite`) rodando, um script Playwright usou a interface como um usuário. A imagem veio da webcam virtual do Chrome, e o componente `Webcam.jsx` capturou o quadro com `getUserMedia`.

| Cenário | Resultado observado |
|---|---|
| Login com admin/admin123 | ✅ Dashboard exibido |
| Cadastro "Ana Paula Souza" (F001) pela webcam + consentimento | ✅ Ficha exibida com a foto capturada |
| Cadastro "Bruno Lima Costa" (F002) | ✅ |
| Cadastro da mesma pessoa A com outra matrícula (F003) | ✅ Recusado: "Este rosto já está cadastrado para o funcionário de matrícula F001" |
| Cadastro com duas pessoas na câmera | ✅ Recusado: "Foram detectados 2 rostos" |
| Registro de ponto, 4 vezes seguidas | ✅ Habilitados: `[Entrada]` → `[Saída para intervalo, Saída final]` → `[Retorno do intervalo]` → `[Saída final]`; cada confirmação mostrou nome, matrícula, data, horário e tipo |
| 5º reconhecimento após a saída final | ✅ Nenhum botão habilitado + aviso "jornada de hoje já foi encerrada" |
| Tela de reconhecimento, funcionário cadastrado | ✅ Identificado, distância 0,1546, confiança 84,2% |
| Tela de reconhecimento, pessoa não cadastrada | ✅ "Reconhecimento não foi possível", distância 0,6601 |
| Tela de reconhecimento, dois rostos | ✅ "Imagem recusada — VARIOS_ROSTOS" |
| Dashboard | ✅ 2 funcionários, 4 registros, 4 hoje, 0 trabalhando (Ana encerrou o dia) |
| Histórico + filtro tipo=Entrada / matrícula=F002 | ✅ 1 registro / 0 registros |
| Ficha individual (espelho de ponto) | ✅ 4 horários na linha do dia |
| Edição do cargo | ✅ Salvo e exibido |
| **Reinício do backend** (processo encerrado e iniciado de novo) | ✅ Funcionários, 4 registros e fotos preservados; reconhecimento continua funcionando (distância 0,1546) |
| Foto sem token (`GET /api/funcionarios/1/foto`) | ✅ 401 |
| Exclusão de F002 pela interface | ✅ Removido da lista; arquivo da foto apagado |
| Layout em tela de celular (390 px) | ✅ Menu lateral recolhido; câmera e etapas empilhadas |
| `npm run build` | ✅ Compilação de produção sem erros |

### Reconhecimento por foto e pelo celular (versão 1.1)
Testado com Chrome headless: em modo desktop (1440 px) e emulando um **Pixel 7** (tela de toque).

| Cenário | Resultado observado |
|---|---|
| Cadastro com **foto de celular "deitada"** (1440×1920, EXIF Orientation=6) pelo botão "Enviar foto" | ✅ Rotação corrigida no navegador; rosto detectado e cadastro concluído |
| Cadastro com arquivo **PNG** | ✅ |
| Registro de ponto por **foto enviada** (outra foto da pessoa) | ✅ Identificado; registro de Entrada gravado e exibido no histórico com a marca "Foto enviada" |
| Foto enviada com **dois rostos** | ✅ Recusada (`VARIOS_ROSTOS`) |
| Arquivo que **não é imagem** (.txt) | ✅ Mensagem "Selecione um arquivo de imagem (JPG ou PNG)" |
| **Celular via HTTPS** na rede (`npm run celular`, `https://IP:5173`) | ✅ `isSecureContext=true`; câmera ao vivo ativa; botões "Reconhecer e registrar", "Tirar foto", "Enviar foto"; funcionário cadastrado por foto foi reconhecido pela câmera e a Entrada foi registrada |
| **Celular via HTTP** na rede (sem HTTPS) | ✅ Câmera ao vivo bloqueada pelo navegador, como esperado; o sistema mostra o aviso e o botão "Tirar foto" (`capture="user"`); a foto foi enviada e o funcionário foi reconhecido |
| Rolagem automática até o resultado no celular | ✅ |

Não testado: um **celular físico** de verdade (Android/iPhone), o aviso de certificado no Safari do iPhone e a liberação do Firewall do Windows. Os passos estão no README, seção 6.1.

As capturas de tela estão em `docs/capturas/`.

> Nos testes de navegador, `INTERVALO_MINIMO_SEGUNDOS=0` foi usado para não esperar 60 s entre as marcações. A regra dos 60 s foi testada no pytest (teste 13).

## O que NÃO foi testado (e precisa ser conferido por você)
- **Instalação e execução no Windows 10/11.** Os testes rodaram em Linux. Os comandos do README e os arquivos `.bat` foram escritos para Windows, mas não foram executados em um Windows.
- **Python 3.12.** Os testes usaram 3.13. As versões fixadas em `requirements.txt` publicam pacotes para 3.12 e 3.13.
- **Webcam física e rostos reais ao vivo.** Foi usada a câmera virtual do Chrome com fotos. Iluminação, foco e qualidade de webcams reais podem exigir ajuste de `NITIDEZ_MINIMA`, `BRILHO_MINIMO` ou `DISTANCE_THRESHOLD` no `.env`.
- **Fotos coloridas de alta resolução.** As imagens de teste são em tons de cinza e de baixa resolução. Imagens de webcam colorida costumam dar resultados iguais ou melhores.
- **Navegadores Firefox/Safari.** Foi usado apenas o Chrome. O Edge usa o mesmo motor.

**Sugestão:** depois de instalar no Windows, rode `python -m pytest -v` (deve dar 22 passed) e faça o roteiro da seção 6 do README com a sua webcam.
