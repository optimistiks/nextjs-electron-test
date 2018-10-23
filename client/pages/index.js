import Link from 'next/link'
import 'quill/dist/quill.snow.css'
import 'quill-cursors/dist/quill-cursors.css'

import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import 'prosemirror-example-setup/style/style.css'

export default () => (
    <div>
        <div>Hello world from index page!</div>
        <div>
            <Link href="/testpage">
                <a>Go to testpage</a>
            </Link>
        </div>
    </div>
)
