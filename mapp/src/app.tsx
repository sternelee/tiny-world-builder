import { Component, PropsWithChildren } from 'react'
import { Provider } from 'mobx-react'

import { EditorStore } from './store/editorStore'

import './app.scss'

const editorStore = new EditorStore()
const store = { editorStore }

class App extends Component<PropsWithChildren> {
  componentDidMount () {}

  componentDidShow () {}

  componentDidHide () {}

  render () {
    return (
      <Provider store={store}>
        {this.props.children}
      </Provider>
    )
  }
}

export default App
