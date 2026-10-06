export const publicSchemaOptions = {
  versionKey: false,
  toJSON: {
    transform(_document, returnedObject) {
      returnedObject.id = returnedObject._id.toString()
      delete returnedObject._id
      delete returnedObject.password

      return returnedObject
    },
  },
}
