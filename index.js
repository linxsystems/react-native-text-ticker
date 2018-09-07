import React, { PureComponent } from 'react'
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  ScrollView,
  NativeModules,
  findNodeHandle
} from 'react-native'
import PropTypes from 'prop-types'

const { UIManager } = NativeModules

export default class TextMarquee extends PureComponent {

  static propTypes = {
    style:           Text.propTypes.style,
    duration:        PropTypes.number,
    loop:            PropTypes.bool,
    bounce:          PropTypes.bool,
    scroll:          PropTypes.bool,
    marqueeOnMount:  PropTypes.bool,
    marqueeDelay:    PropTypes.number,
    useNativeDriver: PropTypes.bool,
    children:        PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.node,
      PropTypes.array
    ]),
    repeatSpacer:    PropTypes.number,
    easing:          PropTypes.func
  }

  static defaultProps = {
    style:             {},
    loop:              true,
    bounce:            true,
    scroll:            true,
    marqueeOnMount:    true,
    marqueeDelay:      0,
    useNativeDriver:   true,
    repeatSpacer:      50,
    easing:            Easing.ease
  }

  animatedValue = new Animated.Value(0)
  distance = null
  textRef = null
  containerRef = null

  state = {
    animating:    false,
    contentFits:  false,
    shouldBounce: false,
    isScrolling:  false
  }

  mounted = false;

  async componentDidMount() {
    this.mounted = true;

    this.invalidateMetrics()
    const { marqueeDelay, marqueeOnMount } = this.props
    if (marqueeOnMount) {
      this.startAnimation(marqueeDelay)
    }
  }

  componentWillUnmount() {
    this.mounted = false;

    // clear all timeouts and intervals to prevent crashing
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    if (this.onScrollTimer) {
      clearTimeout(this.onScrollTimer);
      this.onScrollTimer = null;
    }
    if (this.bounceTimer) {
      clearTimeout(this.bounceTimer);
      this.bounceTimer = null;
    }
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

  }

  startAnimation = (timeDelay) => {
    if (this.state.animating) {
      return
    }
    this.start(timeDelay)
  }

  animateScroll = () => {
    const {duration, marqueeDelay, loop, useNativeDriver, repeatSpacer, easing, children} = this.props
    this.scrollTimer = this.setTimeout(() => {
      Animated.timing(this.animatedValue, {
        toValue:         -this.textWidth - repeatSpacer,
        duration:        duration || children.length * 150,
        easing:          easing,
        useNativeDriver: useNativeDriver
      }).start(({ finished }) => {
        if (finished) {
          if (loop) {
            this.animatedValue.setValue(0)
            this.animateScroll()
          }
        }
      })
    }, marqueeDelay)
  }

  animateBounce = () => {
    const {duration, marqueeDelay, loop, useNativeDriver, easing, children} = this.props
    this.bounceTimer = this.setTimeout(() => {
      Animated.sequence([
        Animated.timing(this.animatedValue, {
          toValue:         -this.distance - 10,
          duration:        duration || children.length * 50,
          easing:          easing,
          useNativeDriver: useNativeDriver
        }),
        Animated.timing(this.animatedValue, {
          toValue:         10,
          duration:        duration || children.length * 50,
          easing:          easing,
          useNativeDriver: useNativeDriver
        })
      ]).start(({finished}) => {
        if (loop) {
          this.animateBounce()
        }
      })
    }, marqueeDelay)
  }

  start = async (timeDelay) => {
    if (this.mounted) {
      this.setState({ animating: true })
      this.startTimer = this.setTimeout(async () => {
        await this.calculateMetrics()
        if (!this.state.contentFits) {
          if (this.state.shouldBounce && this.props.bounce) {
            this.animateBounce()
          } else {
            this.animateScroll()
          }
        }
      }, 100)
    }
  }

  stopAnimation() {
    this.animatedValue.setValue(0)
    if (this.mounted) {
      this.setState({ animating: false, shouldBounce: false })
    }
  }

  async calculateMetrics() {
    return new Promise(async (resolve, reject) => {
      try {
        const measureWidth = node =>
          new Promise(resolve => {
            UIManager.measure(findNodeHandle(node), (x, y, w) => {
              // console.log('Width: ' + w)
              return resolve(w)
            })
          })

        if (this.mounted) {
          const [containerWidth, textWidth] = await Promise.all([
            measureWidth(this.containerRef),
            measureWidth(this.textRef)
          ]);

          this.containerWidth = containerWidth
          this.textWidth = textWidth
          this.distance = textWidth - containerWidth

          if (this.mounted) {
            this.setState({
              // Is 1 instead of 0 to get round rounding errors from:
              // https://github.com/facebook/react-native/commit/a534672
              contentFits:  this.distance <= 1,
              shouldBounce: this.distance < this.containerWidth / 8
            })
          }
        }

        // console.log(`distance: ${this.distance}, contentFits: ${this.state.contentFits}`)
        resolve([])
      } catch (error) {
        console.warn(error)
      }
    })
  }

  invalidateMetrics = () => {
    this.distance = null
    if (this.mounted) {
      this.setState({ contentFits: false })
    }
  }

  clearTimeout() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  setTimeout(fn, time = 0) {
    this.clearTimeout()
    this.timer = setTimeout(fn, time)
  }

  onScroll = () => {
    if (this.mounted) {
      this.clearTimeout()
      this.setState({ isScrolling: true })
      this.animatedValue.setValue(0)
      this.onScrollTimer = this.setTimeout(() => {
        if (this.mounted) {
          this.setState({ isScrolling: false })
          this.start()
        }
      }, this.props.marqueeDelay || 3000)
    }
  }

  render() {
    const { style, children, repeatSpacer, scroll, ... props } = this.props
    const { animating, contentFits, isScrolling } = this.state
    return (
      <View style={[styles.container]}>
        <View
          {...props}
          numberOfLines={1}
          style={[style, {flexDirection: 'row',  opacity: animating ? 0 : 1 }]}
        >
          {this.props.children}
        </View>
        <ScrollView
          ref={c => (this.containerRef = c)}
          horizontal
          scrollEnabled={scroll ? !this.state.contentFits : false}
          scrollEventThrottle={16}
          onScroll={this.onScroll}
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFillObject}
          display={animating ? 'flex' : 'none'}
          onContentSizeChange={() => this.calculateMetrics()}
        >
          <Animated.View
            ref={c => (this.textRef = c)}
            numberOfLines={1}
            {... props}
            style={[style, {flexDirection: 'row',  transform: [{ translateX: this.animatedValue }], width: null }]}
          >
            {this.props.children}
          </Animated.View>
          {!contentFits && !isScrolling
            ? <View style={{ paddingLeft: repeatSpacer }}>
              <Animated.View
                numberOfLines={1}
                {... props}
                style={[style, { transform: [{ translateX: this.animatedValue }], width: null }]}
              >
                {this.props.children}
              </Animated.View>
            </View> : null }
        </ScrollView>
      </View>
    )
  }

}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden'
  }
})
