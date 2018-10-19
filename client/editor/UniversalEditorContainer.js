import dynamic from 'next/dynamic'

// importing Quill  in a server environment, so we wrap the component that imports Quill into a dynamic import
// this will ensure that this component will not render on server
const UniversalEditorContainer = dynamic(() => import('./EditorContainer'), { ssr: false })

export default UniversalEditorContainer
