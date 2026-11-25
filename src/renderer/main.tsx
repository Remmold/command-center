import './monacoLoader'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadChatHistory } from './state/chatItemsStore'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

loadChatHistory(window.api.chatHistory)
createRoot(container).render(<App />)
