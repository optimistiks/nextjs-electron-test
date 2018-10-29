import React from 'react'
import PropTypes from 'prop-types'

Editor.propTypes = {
    users: PropTypes.object.isRequired
}

export default function Editor(props) {
    return (
        <div>
            <div>
                <h3>Users</h3>
                {Object.keys(props.users).map((userKey, index) => {
                    return (
                        <div key={index} style={{ background: props.users[userKey].color, color: 'white', padding: '5px', margin: '5px' }}>
                            {`User ${userKey}`}
                        </div>
                    )
                })}
            </div>
            <div id="editor" style={{ marginBottom: '23px' }}></div>
        </div>
    )
}
