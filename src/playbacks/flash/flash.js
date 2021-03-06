// Copyright 2014 Globo.com Player authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import {seekStringToSeconds} from 'base/utils'

import BaseFlashPlayback from 'playbacks/base_flash_playback'
import Browser from 'components/browser'
import Mediator from 'components/mediator'
import template from 'base/template'
import $ from 'clappr-zepto'
import Events from 'base/events'
import flashSwf from './public/Player.swf'

var MAX_ATTEMPTS = 60

export default class Flash extends BaseFlashPlayback {
  get name() { return 'flash' }
  get swfPath() { return template(flashSwf)({baseUrl: this.baseUrl}) }

  constructor(options) {
    super(options)
    this.src = options.src
    this.baseUrl = options.baseUrl
    this.autoPlay = options.autoPlay
    this.settings = {default: ['seekbar']}
    this.settings.left = ["playpause", "position", "duration"]
    this.settings.right = ["fullscreen", "volume"]
    this.settings.seekEnabled = true
    this.isReady = false
    this.addListeners()
  }


  bootstrap() {
    if (this.el.playerPlay) {
      this.el.width = "100%"
      this.el.height = "100%"
      if (this.currentState === 'PLAYING') {
        this.firstPlay()
      } else {
        this.currentState = "IDLE"
        this.autoPlay && this.play()
      }
      $('<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%" />').insertAfter(this.$el)
      if (this.getDuration() > 0) {
        this.metadataLoaded()
      } else {
        Mediator.once(this.uniqueId + ':timeupdate', this.metadataLoaded, this)
      }
    } else {
      this._attempts = this._attempts || 0
      if (++this._attempts <= MAX_ATTEMPTS) {
        setTimeout(() => this.bootstrap(), 50)
      } else {
        this.trigger(Events.PLAYBACK_ERROR, {message: "Max number of attempts reached"}, this.name)
      }
    }
  }

  metadataLoaded() {
    this.isReady = true
    this.trigger(Events.PLAYBACK_READY, this.name)
    this.trigger(Events.PLAYBACK_SETTINGSUPDATE, this.name)
  }

  getPlaybackType() {
    return 'vod'
  }

  isHighDefinitionInUse() {
    return false
  }

  updateTime() {
    this.trigger(Events.PLAYBACK_TIMEUPDATE, this.el.getPosition(), this.el.getDuration(), this.name)
  }

  addListeners() {
    Mediator.on(this.uniqueId + ':progress', this.progress, this)
    Mediator.on(this.uniqueId + ':timeupdate', this.updateTime, this)
    Mediator.on(this.uniqueId + ':statechanged', this.checkState, this)
    Mediator.on(this.uniqueId + ':flashready', this.bootstrap, this)
  }

  stopListening() {
    super.stopListening()
    Mediator.off(this.uniqueId + ':progress')
    Mediator.off(this.uniqueId + ':timeupdate')
    Mediator.off(this.uniqueId + ':statechanged')
    Mediator.off(this.uniqueId + ':flashready')
  }

  checkState() {
    if (this.isIdle || this.currentState === "PAUSED") {
      return
    } else if (this.currentState !== "PLAYING_BUFFERING" && this.el.getState() === "PLAYING_BUFFERING") {
      this.trigger(Events.PLAYBACK_BUFFERING, this.name)
      this.currentState = "PLAYING_BUFFERING"
    } else if (this.el.getState() === "PLAYING") {
      this.trigger(Events.PLAYBACK_BUFFERFULL, this.name)
      this.currentState = "PLAYING"
    } else if (this.el.getState() === "IDLE") {
      this.currentState = "IDLE"
    } else if (this.el.getState() === "ENDED") {
      this.trigger(Events.PLAYBACK_ENDED, this.name)
      this.trigger(Events.PLAYBACK_TIMEUPDATE, 0, this.el.getDuration(), this.name)
      this.currentState = "ENDED"
      this.isIdle = true
    }
  }

  progress() {
    if (this.currentState !== "IDLE" && this.currentState !== "ENDED") {
      this.trigger(Events.PLAYBACK_PROGRESS, 0, this.el.getBytesLoaded(), this.el.getBytesTotal(), this.name)
    }
  }

  firstPlay() {
    if (this.el.playerPlay) {
      this.isIdle = false
      this.el.playerPlay(this.src)
      this.listenToOnce(this, Events.PLAYBACK_BUFFERFULL, () => this.checkInitialSeek())
      this.currentState = "PLAYING"
    } else {
      this.listenToOnce(this, Events.PLAYBACK_READY, this.firstPlay)
    }
  }

  checkInitialSeek() {
    var seekTime = seekStringToSeconds(window.location.href)
    if (seekTime !== 0) {
      this.seekSeconds(seekTime)
    }
  }

  play() {
    if (this.currentState === 'PAUSED' || this.currentState === 'PLAYING_BUFFERING') {
      this.currentState = "PLAYING"
      this.el.playerResume()
      this.trigger(Events.PLAYBACK_PLAY, this.name)
    } else if (this.currentState !== 'PLAYING') {
      this.firstPlay()
      this.trigger(Events.PLAYBACK_PLAY, this.name)
    }
  }

  volume(value) {
    if (this.isReady) {
      this.el.playerVolume(value)
    } else {
      this.listenToOnce(this, Events.PLAYBACK_BUFFERFULL, () => this.volume(value))
    }
  }

  pause() {
    this.currentState = "PAUSED"
    this.el.playerPause()
    this.trigger(Events.PLAYBACK_PAUSE, this.name)
  }

  stop() {
    this.el.playerStop()
    this.trigger(Events.PLAYBACK_TIMEUPDATE, 0, this.name)
  }

  isPlaying() {
    return !!(this.isReady && this.currentState.indexOf("PLAYING") > -1)
  }

  getDuration() {
    return this.el.getDuration()
  }

  seek(seekBarValue) {
    if (this.el.getDuration() > 0) {
      var seekTo = this.el.getDuration() * (seekBarValue / 100)
      this.seekSeconds(seekTo)
    } else {
      this.listenToOnce(this, Events.PLAYBACK_BUFFERFULL, () => this.seek(seekBarValue))
    }
  }

  seekSeconds(seekTo) {
    if (this.isReady && this.el.playerSeek) {
      this.el.playerSeek(seekTo)
      this.trigger(Events.PLAYBACK_TIMEUPDATE, seekTo, this.el.getDuration(), this.name)
      if (this.currentState === "PAUSED") {
        this.el.playerPause()
      }
    } else {
      this.listenToOnce(this, Events.PLAYBACK_BUFFERFULL, () => this.seekSeconds(seekTo))
    }
  }

  destroy() {
    clearInterval(this.bootstrapId)
    super.stopListening()
    this.$el.remove()
  }
}

Flash.canPlay = function(resource) {
  if (!Browser.hasFlash || !resource || resource.constructor !== String) {
    return false
  } else {
    var resourceParts = resource.split('?')[0].match(/.*\.(.*)$/) || []
    return resourceParts.length > 1 && !Browser.isMobile && resourceParts[1].match(/^(mp4|mov|f4v|3gpp|3gp)$/)
  }
}
