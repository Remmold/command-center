import './monacoLoader'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TestFlowWindow } from './components/testFlow/TestFlowWindow'
import { TEST_FLOW_WINDOW_QUERY } from '../shared/testFlow'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

const testFlowOnly = new URLSearchParams(location.search).get('mode') === TEST_FLOW_WINDOW_QUERY.mode
if (testFlowOnly) document.title = 'Test flow'
createRoot(container).render(testFlowOnly ? <TestFlowWindow /> : <App />)
