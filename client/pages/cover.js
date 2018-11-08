import Link from 'next/link'
import CoverEditorContainer from '../coverEditor/CoverEditorContainer'

export default () => (
    <div>
        <div>Hello world from cover!</div>
        <div>
            <Link href="/">
                <a>Back to index</a>
            </Link>
            <div>
                <CoverEditorContainer />
            </div>
        </div>
    </div>
)
