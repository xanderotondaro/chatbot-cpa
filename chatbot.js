const { Client, LocalAuth } = require("whatsapp-web.js")
const qrcode = require("qrcode-terminal")

/* ========================
   CONFIG CLIENT
======================== */
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
})

// Proteção: evitar que qualquer chamada da lib publique Status automaticamente.
// Caso a API do whatsapp-web.js exponha métodos como setStatus/sendStatus etc.,
// sobrescrevemos com no-ops para garantir que nada seja publicado.
const noopStatusBlocker = async (...args) => {
  console.log('Bloqueado: tentativa de publicar Status', ...args)
  return null
}
// Lista de nomes comuns de métodos que podem publicar status
const statusMethods = ['setStatus', 'sendStatus', 'postStatus', 'publishStatus', 'updateStatus']
for (const name of statusMethods) {
  try {
    if (!client[name]) client[name] = noopStatusBlocker
  } catch (e) {
    // silencioso — se não puder sobrescrever, apenas continua
  }
}
/* ========================
   QR CODE
======================== */
client.on("qr", (qr) => {
  console.clear()
  console.log("ESCANEIE O QR CODE ⬇️")
  qrcode.generate(qr, { small: true })
})

/* ========================
   BOT ONLINE
======================== */
client.on("ready", () => {
  console.log("🤖 BOT ONLINE COM SUCESSO!")
})

client.on("authenticated", () => {
  console.log("🔐 AUTENTICADO COM SUCESSO!")
})

/* ========================
   RECONEXÃO AUTOMÁTICA
======================== */
client.on("disconnected", (reason) => {
  console.log("❌ BOT DESCONECTADO:", reason)
  console.log("♻️ Tentando reconectar...")
  client.initialize()
})

/* ========================
   UTILIDADES
======================== */
const delay = (ms) => new Promise(res => setTimeout(res, ms))
const etapas = {} // controle de funil
const dadosUsuario = {} // armazenar dados do formulário
const conversaFinalizada = {} // marcar conversa finalizada

const validarFormulario = (texto) => {
  const campos = ["LINK", "DEPOSITANTES", "META", "MÉDIA", "MONTANTE", "VALOR ENVIADO", "PRAZO"]
  const linhas = texto.split("\n")
  
  let camposPreenchidos = 0
  
  for (let linha of linhas) {
    for (let campo of campos) {
      // Verifica se a linha contém o campo e se há algo depois do ":"
      const regex = new RegExp(`${campo}[^:]*:\\s*(.+)`, "i")
      const match = linha.match(regex)
      
      if (match && match[1] && match[1].trim().length > 0) {
        camposPreenchidos++
        break // conta uma vez por linha
      }
    }
  }
  
  return camposPreenchidos >= 6 // pelo menos 6 campos preenchidos com valores
}

/* ========================
   EVENTO PRINCIPAL
======================== */
client.on("message", async (msg) => {
  try {
    if (!msg.body || msg.from.includes("@g.us")) return // ignora grupos

    const texto = msg.body.trim().toLowerCase()
    const chat = await msg.getChat()

    console.log("📩 NOVA MSG:", msg.from, "->", texto)

    // Se conversa foi finalizada, só permite iniciar com "oi"
    if (conversaFinalizada[msg.from] && !["oi", "olá", "ola", "menu", "amigo"].includes(texto)) {
      return // ignora qualquer mensagem que não seja para reiniciar
    }

    /* ===== RESET ===== */
    if (texto === "sair") {
      delete etapas[msg.from]
      conversaFinalizada[msg.from] = true // marca como finalizada
      await msg.reply("Fluxo encerrado. Digite *oi* para começar novamente.")
      return
    }

    /* ===== MENU ===== */
    if (["oi", "olá", "ola", "menu", "amigo"].includes(texto)) {
      const contact = await msg.getContact()
      const name = contact.pushname || "amigo"

      // Limpa o marcador de conversa finalizada ao reiniciar
      delete conversaFinalizada[msg.from]
      etapas[msg.from] = "menu"

      await chat.sendStateTyping()
      await delay(1000)

      await msg.reply(
`Olá ${name}! 👋 Seja bem-vindo.

Escolha uma opção:

1️⃣ Depositantes + montante
2️⃣ Tabela de valores
3️⃣ Plataformas que estou fazendo
4️⃣ Falar com um atendente

Digite *sair* a qualquer momento para encerrar.`
      )
      return
    }

    /* ===== OPÇÃO 1 ===== */
    if (etapas[msg.from] === "menu" && texto === "1") {
      etapas[msg.from] = "opcao1"
      await msg.reply(`� *FORMULÁRIO DE DEPÓSITO*

┌─────────────────────────────────
│  Preencha todos os campos:
├─────────────────────────────────
│ 💼 CPALEXANDRE:
│ 🔗 LINK:
│ 👥 DEPOSITANTES:
│ 🎯 META:
│ 📊 MÉDIA:
│ 💵 MONTANTE:
│ 💸 VALOR ENVIADO:
│ ⏰ PRAZO:
└─────────────────────────────────

*Exemplo:*
_CPALEXANDRE: seu_codigo_
_LINK: https://link....
_DEPOSITANTES: 10_
_META: 5000_
_MÉDIA: 60_
_MONTANTE: 500_
_VALOR ENVIADO: 125_
_PRAZO: 7 dias_

Digite *Menu* para voltar ao menu principal.`)  

      return
    }

    /* ===== OPÇÃO 2 ===== */
    if (etapas[msg.from] === "menu" && texto === "2") {
      etapas[msg.from] = "opcao2"
      await msg.reply(`📊 *TABELA DE VALORES*

*COMISSÃO POR MÉDIA:*
┌──────────────────────────────
│   MÉDIA       COMISSÃO
├──────────────────────────────
│   40+        R$ 8,00/pessoa
│   50+        R$ 9,00/pessoa
│   60+        R$ 9,50/pessoa
└──────────────────────────────

*COMISSÃO POR MONTANTE:*
┌───────────────────────────────
│   MONTANTE      COMISSÃO     
├───────────────────────────────
│  R$ 300        R$ 75,00     
│  R$ 400        R$ 100,00     
│  R$ 500        R$ 125,00     
│  R$ 600        R$ 150,00     
│  R$ 700        R$ 175,00     
│  R$ 800        R$ 200,00     
│  R$ 900        R$ 225,00     
│ R$ 1.000       R$ 250,00     
└───────────────────────────────
Digite *Menu* para voltar ao menu principal.`)

      return
    }

    /* ===== OPÇÃO 3 ===== */
    if (etapas[msg.from] === "menu" && texto === "3") {
      etapas[msg.from] = "opcao3"
      await msg.reply(
`🚀 *PLATAFORMAS DISPONÍVEIS*

┌────────────────────────────────
│   LISTA DE PLATAFORMAS        
├────────────────────────────────
│ 1️⃣  MANGA                      
│ 2️⃣  BJP                        
│ 3️⃣  KF                         
│ 4️⃣  GO                         
│ 5️⃣  COROA                     
│ 6️⃣  M8, M9, AM, AA, V5        
│ 7️⃣  BC, BY                     
│ 8️⃣  OKOK, WP, XW, ANJO, 777   
│ 9️⃣  888, 777CLUBE, 5555       
│ 🔟 BRA, GAME                   
│ ➕ MAIS PLATAFORMAS EM BREVE!  
└────────────────────────────────┘

Digite *Menu* para voltar ao menu principal.`)
      return
    }

    if (etapas[msg.from] === "menu" && texto === "4") {
      etapas[msg.from] = "opcao4"
      await msg.reply("👨‍💼 Um de nossos atendentes entrará em contato com você em breve. Obrigado!")
      // Finaliza a conversa com este contato específico
      delete etapas[msg.from]
      conversaFinalizada[msg.from] = true // marca como finalizada
      return
    }

    /* ===== INFORMAÇÕES ADICIONAIS ===== */
    if (etapas[msg.from] === "opcao1" || etapas[msg.from] === "opcao2" || etapas[msg.from] === "opcao3") {
      console.log("📦 DADOS RECEBIDOS:", texto)
      
      // Valida se o formulário foi preenchido corretamente
      if (validarFormulario(msg.body)) {
        dadosUsuario[msg.from] = msg.body
        
        await delay(800)

        // Adiciona o contato aos favoritos
        await chat.pin()

        await msg.reply("✅ Dados recebidos! Em breve nossa equipe entra em contato.")
        
        // Finaliza a conversa com este contato específico
        delete etapas[msg.from]
        delete dadosUsuario[msg.from]
        conversaFinalizada[msg.from] = true // marca como finalizada
        
        return
      } else {
        // Se não preencheu corretamente, pede novamente
        await msg.reply("⚠️ Formulário incompleto. Por favor, envie todos os dados solicitados:\n\nCPALEXANDRE\nLINK 🔗:\nDEPOSITANTES:\nMETA:\nMÉDIA:\nMONTANTE:\nVALOR ENVIADO:\nPRAZO:\n\nDigite *Menu* para voltar ao menu principal.")
        return
      }
    }

    /* ===== FALLBACK ===== */
    await msg.reply("Digite *oi* para iniciar o atendimento.")

  } catch (err) {
    console.error("🔥 ERRO NO BOT:", err)
    await msg.reply("⚠️ Ocorreu um erro. Tente novamente em instantes.")
  }
})

/* ========================
   START BOT
======================== */
client.initialize()
