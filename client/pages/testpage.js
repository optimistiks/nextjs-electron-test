import Link from 'next/link'
import UniversalEditorContainer from '../editor/UniversalEditorContainer'

// it seems like importing CSS from inside a dynamic-import module does not work well
// https://github.com/zeit/next.js/issues/4184
// there is also an issue that prevents link from working if the target page is importing css
// https://github.com/zeit/next-plugins/issues/282
// so what we do is we import that css on all pages (but the proper fix would be to define custom _app.js and import
// styles from there)
import 'quill/dist/quill.snow.css'
import 'quill-cursors/dist/quill-cursors.css'

import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import 'prosemirror-example-setup/style/style.css'

export default () => (
    <div>
        <div>Hello world from testpage!</div>
        <div>
            <Link href="/">
                <a>Back to index</a>
            </Link>
            <div>
                <UniversalEditorContainer />
            </div>
        </div>
    </div>
)
