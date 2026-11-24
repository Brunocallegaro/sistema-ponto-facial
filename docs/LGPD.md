# Proteção de dados biométricos e LGPD

> Observação: este texto é uma orientação acadêmica, não um parecer jurídico. Para uso real em uma empresa, consulte o encarregado de dados (DPO) ou um advogado.

## Por que isso importa
A **Lei Geral de Proteção de Dados (Lei nº 13.709/2018)** classifica o **dado biométrico** como **dado pessoal sensível** (art. 5º, II). A fotografia facial usada para identificação e o vetor facial (*embedding*) gerado pelo DeepFace se enquadram nessa categoria. O tratamento exige cuidados reforçados (art. 11).

## Pontos que um sistema real precisa observar
1. **Base legal e consentimento:** o tratamento precisa de uma base legal do art. 11. Em geral é o **consentimento específico e destacado** do titular. Em alguns casos pode ser o cumprimento de obrigação legal. Na relação de emprego, o consentimento é questionável por causa da subordinação. Por isso, recomenda-se **oferecer uma alternativa** (cartão, PIN) a quem não quiser usar a biometria.
2. **Finalidade e necessidade:** usar a imagem **somente** para o registro de ponto e coletar o mínimo necessário.
3. **Transparência:** informar ao funcionário quais dados são coletados, para quê, por quanto tempo e quem tem acesso.
4. **Direitos do titular:** acesso, correção e **eliminação** dos dados (art. 18).
5. **Segurança:** medidas técnicas para evitar acesso não autorizado, vazamento ou uso indevido (art. 46).
6. **Retenção:** apagar a biometria quando o vínculo terminar. Os registros de ponto podem precisar ser guardados por prazo trabalhista, mas a biometria não.
7. **RIPD:** elaborar o Relatório de Impacto à Proteção de Dados, recomendado para dados sensíveis.

## O que o FacePonto já implementa
| Medida | Onde |
|---|---|
| Caixa de **consentimento obrigatória** antes de capturar e salvar a foto | `CadastroFuncionario.jsx` |
| Fotos com **nome aleatório (UUID)**, re-codificadas em JPEG (remove EXIF e localização) | `storage.py` |
| Pasta de fotos **não publicada**; a foto só sai pelo endpoint autenticado e com `Cache-Control: no-store` | `main.py` |
| **Embedding nunca é devolvido** pela API (o esquema de saída não contém o campo) | `schemas.py` |
| Todos os endpoints de dados exigem **login** (JWT) | `security.py` |
| **Eliminação completa** ao excluir: registro, embedding e arquivo da foto | `main.py` → `excluir_funcionario` |
| Proteção de caminho (*path traversal*) ao ler fotos | `storage.py` |
| Limite de tentativas no login e no reconhecimento | `security.py` |
| Registro da **origem** da imagem (câmera ao vivo × foto enviada) e opção de desligar o reconhecimento por foto enviada (`PERMITIR_FOTO_ARQUIVO=false`) | `config.py`, `main.py` |
| Fotos enviadas pelo celular são reduzidas e re-codificadas no navegador antes do envio (sem EXIF/GPS) | `Webcam.jsx` |
| Logs sem imagens nem embeddings (só matrícula e distância) | `main.py` |

## Recomendações para produção
- Trocar `SECRET_KEY` e `ADMIN_PASSWORD` no `.env`; usar HTTPS.
- Criptografar o banco e a pasta `uploads/` (ex.: BitLocker) ou os embeddings em repouso.
- Restringir o acesso físico ao computador do ponto e fazer backups protegidos.
- Ter um termo de consentimento por escrito e uma política de privacidade.
- Definir prazo de retenção e rotina de eliminação para ex-funcionários.
