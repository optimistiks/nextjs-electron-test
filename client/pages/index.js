import Link from 'next/link'
import 'quill/dist/quill.snow.css'
import 'quill-cursors/dist/quill-cursors.css'

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
