const { Schema } = require('prosemirror-model')
const { schema: basicSchema } = require('prosemirror-schema-basic')
const { addListNodes } = require('prosemirror-schema-list')

const schema = new Schema({
    nodes: addListNodes(basicSchema.spec.nodes, "paragraph block*", "block"),
    marks: basicSchema.spec.marks
})

module.exports = schema
