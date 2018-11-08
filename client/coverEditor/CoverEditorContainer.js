import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import Konva from 'konva'

export default class CoverEditorContainer extends PureComponent {
    constructor (props) {
        super(props)
    }

    componentDidMount () {
        console.log('didMount')

        var stage = new Konva.Stage({
            container: 'container',
            width: window.innerWidth,
            height: window.innerHeight
        });

        // add canvas element
        var layer = new Konva.Layer();
        layer.offsetX(-window.innerWidth)
        layer.offsetY(-window.innerHeight)
        stage.scale({ x: 0.25, y: 0.25 })

        stage.add(layer);

        // create shape
        const image = new Image()
        var coverBackground = new Konva.Image({
            x: 0,
            y: 0,
            draggable: true,
            opacity: 0.2
        });
        var front = new Konva.Rect({
            x: 0,
            y: 0,
            width: 1500, // 5inch @300PPI
            height: 2400, // 8inch @300PPI
            fillPatternOffset: { x: 0, y: 0 },
            stroke: 'white',
            strokeWidth: 1
        }); 
        var spine = new Konva.Rect({
            x: 1500,
            y: 0,
            width: 300, // 1inch @300PPI
            height: 2400, // 8inch @300PPI
            fillPatternOffset: { x: 1500, y: 0 },
            stroke: 'white',
            strokeWidth: 1
        }); 
        var back = new Konva.Rect({
            x: 1800,
            y: 0,
            width: 1500, // 5inch @300PPI
            height: 2400, // 8inch @300PPI
            fillPatternOffset: { x: 1800, y: 0 },
            stroke: 'white',
            strokeWidth: 1
        }); 

        coverBackground.on('dragmove', () => {
            const imgPos = coverBackground.getAbsolutePosition(layer)
            const backPos = back.getAbsolutePosition(layer)
            const spinePos = spine.getAbsolutePosition(layer)
            const frontPos = front.getAbsolutePosition(layer)
            const backFillPatternOffset = { x: backPos.x - imgPos.x, y: backPos.y - imgPos.y }
            const spineFillPatternOffset = { x: spinePos.x - imgPos.x, y: spinePos.y - imgPos.y }
            const frontFillPatternOffset = { x: frontPos.x - imgPos.x, y: frontPos.y - imgPos.y }
            back.fillPatternOffset(backFillPatternOffset)
            spine.fillPatternOffset(spineFillPatternOffset)
            front.fillPatternOffset(frontFillPatternOffset)
        })
        
        layer.add(coverBackground);
        layer.add(front);
        layer.add(spine);
        layer.add(back);
        layer.draw();

        image.onload = (event) => {
            console.log('onload')
            coverBackground.setImage(image)
            coverBackground.setAttrs({ width: event.target.naturalWidth, height: event.target.naturalHeight })

            front.fillPatternImage(image)
            spine.fillPatternImage(image)
            back.fillPatternImage(image)
            layer.draw()
        }
        image.src = '/static/cover-bg.jpg'


        // function from https://stackoverflow.com/a/15832662/512042
        function downloadURI(uri, name) {
            var link = document.createElement("a");
            link.download = name;
            link.href = uri;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        document.getElementById('save').addEventListener('click', function () {
            var printStage = new Konva.Stage({
                container: 'printContainer',
                width: 3300,
                height: 2400
            });

            var printLayer = new Konva.Layer();
            printStage.add(printLayer)

            printLayer.add(front)
            printLayer.add(spine)
            printLayer.add(back)

            printLayer.draw()

            var dataURL = printStage.toDataURL();
            downloadURI(dataURL, 'stage.png');
        }, false);
    }

    render () {
        console.log('render')
        return (
            <div>
                <div id="container" />
                <button id="save">
                    Save as image
                </button>
                <div id="printContainer" />
            </div>
        )
    }
}