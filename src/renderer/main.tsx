import './monacoLoader'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TestFlowWindow } from './components/testFlow/TestFlowWindow'
import { TEST_FLOW_WINDOW_QUERY } from '../shared/testFlow'
import { loadChatHistory, migrateLegacyChatItems } from './state/chatItemsStore'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

const testFlowOnly = new URLSearchParams(location.search).get('mode') === TEST_FLOW_WINDOW_QUERY.mode
if (testFlowOnly) {
  document.title = 'Test flow'
  createRoot(container).render(<TestFlowWindow />)
} else {
  // The first frame shows migrated chats: the old entry is moved over before history loads and the app renders.
  void migrateLegacyChatItems(localStorage, window.api.chatHistory.importLegacy).then(() => {
    loadChatHistory(window.api.chatHistory)
    createRoot(container).render(<App />)
  })
}
