import createError from 'http-errors'

const identity = async (value) => value

export function createCrudController({ model, singularName, pluralName, normalizeInput, prepareInput = identity }) {
  return {
    create: async (request, response) => {
      const normalizedInput = normalizeInput(request.body)
      const input = await prepareInput(normalizedInput)
      const document = await model.create(input)

      response.status(201).json({
        success: true,
        message: `${singularName} added successfully.`,
        data: document,
      })
    },

    getAll: async (_request, response) => {
      const documents = await model.find().sort({ _id: 1 })

      response.json({
        success: true,
        message: `${pluralName} list retrieved successfully.`,
        data: documents,
      })
    },

    getById: async (request, response) => {
      const document = await model.findById(request.params.id)

      if (!document) {
        throw createError(404, `${singularName} not found`)
      }

      response.json({
        success: true,
        message: `${singularName} retrieved successfully.`,
        data: document,
      })
    },

    update: async (request, response) => {
      const normalizedInput = normalizeInput(request.body, { partial: true })
      const input = await prepareInput(normalizedInput)
      const document = await model.findByIdAndUpdate(
        request.params.id,
        { $set: input },
        { new: true, runValidators: true },
      )

      if (!document) {
        throw createError(404, `${singularName} not found`)
      }

      response.json({
        success: true,
        message: `${singularName} updated successfully.`,
      })
    },

    delete: async (request, response) => {
      const document = await model.findByIdAndDelete(request.params.id)

      if (!document) {
        throw createError(404, `${singularName} not found`)
      }

      response.json({
        success: true,
        message: `${singularName} deleted successfully.`,
      })
    },
  }
}
