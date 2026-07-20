import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import {resolveDownloadDirectory} from './settings.js'

test('download locations expand home and relative paths', () => {
  assert.equal(resolveDownloadDirectory('~/Exports', '/work/project', '/users/editor'), path.resolve('/users/editor/Exports'))
  assert.equal(resolveDownloadDirectory('./renders', '/work/project', '/users/editor'), path.resolve('/work/project/renders'))
  assert.equal(resolveDownloadDirectory('  /media/drive  ', '/work/project', '/users/editor'), path.resolve('/media/drive'))
})

test('download locations reject empty paths and unsupported home shortcuts', () => {
  assert.throws(() => resolveDownloadDirectory('   '), /enter a folder path/)
  assert.throws(() => resolveDownloadDirectory('~someone/videos'), /use ~\/folder/)
})
