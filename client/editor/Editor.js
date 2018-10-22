import React from 'react'
import PropTypes from 'prop-types'

Editor.propTypes = {
    users: PropTypes.object.isRequired
}

export default function Editor (props) {
    return (
        <div>
            <div>
                {Object.values(props.users).map((user, index) => {
                    return (
                        <div 
                            style={{ border: `1px solid ${user.color}`, color: user.color, padding: '10px' }}
                            key={index}    
                        >
                            {user.name}
                        </div>
                    )
                })}
            </div>
            <div id="editor"></div>
        </div>
    )
}
