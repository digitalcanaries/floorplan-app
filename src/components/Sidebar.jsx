import useStore from '../store.js'
import PdfUploader from './PdfUploader.jsx'
import SetsTab from './SetsTab.jsx'
import RulesTab from './RulesTab.jsx'

export default function Sidebar() {
  const { sidebarTab, setSidebarTab } = useStore()

  return (
    <div className="w-72 bg-gray-800 text-white flex flex-col border-r border-gray-700 shrink-0 overflow-hidden">
      <PdfUploader />

      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setSidebarTab('sets')}
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            sidebarTab === 'sets' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Sets
        </button>
        <button
          onClick={() => setSidebarTab('rules')}
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            sidebarTab === 'rules' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Rules
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'sets' ? <SetsTab /> : <RulesTab />}
      </div>
    </div>
  )
}
