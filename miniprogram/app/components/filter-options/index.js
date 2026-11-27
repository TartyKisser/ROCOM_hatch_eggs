Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    disabled: Boolean,
    fields: { type: Array, value: [] },
  },
  data: { openIndex: -1 },
  methods: {
    toggleField({ currentTarget: { dataset: { index } } }) {
      const field = this.data.fields[index]
      if (this.data.disabled || !field || field.options.length < 2) return
      this.setData({ openIndex: index === this.data.openIndex ? -1 : index })
    },

    selectOption({ currentTarget: { dataset: { index } } }) {
      const field = this.data.fields[this.data.openIndex]
      const option = field?.options[index]
      if (this.data.disabled || !option) return
      this.close()
      if (field.index !== index) this.triggerEvent('change', { key: field.key, index, value: option.value ?? index })
    },

    close() {
      if (this.data.openIndex >= 0) this.setData({ openIndex: -1 })
    },
  },
})
