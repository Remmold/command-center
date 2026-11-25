import './monacoLoader'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadChatHistory, migrateLegacyChatItems } from './state/chatItemsStore'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

// The first frame shows migrated chats: the old entry is moved over before history loads and the app renders.
void migrateLegacyChatItems(localStorage, window.api.chatHistory.importLegacy).then(() => {
  loadChatHistory(window.api.chatHistory)
  createRoot(container).render(<App />)
})
