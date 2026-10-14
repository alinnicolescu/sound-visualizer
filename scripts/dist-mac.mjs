#!/usr/bin/env node
/**
 * Build the Mac app for sharing, then run Apple's own checks on it.
 *
 *   npm run dist:mac        build dist/Sound-Visualizer-<version>-mac.dmg (and .zip)
 *   npm run verify:mac      only run the checks on what's already in dist/
 *
 * One universal app: runs natively on Apple Silicon (M1 and later) and Intel Macs.
 *
 * How it's signed depends on what this Mac has (see RELEASING.md):
 *   1. A "Developer ID Application" certificate in the keychain, and Apple
 *      notarization credentials in the environment:
 *        APPLE_API_KEY (path to the .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
 *      or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
 *      -> signed, hardened, notarized and stapled. Opens anywhere, no warnings.
 *   2. The certificate but no credentials -> signed, not notarized (macOS warns).
 *   3. Neither -> ad-hoc signed, for testing: on other Macs it has to be opened
 *      with right-click > Open (or System Settings > Privacy & Security > Open Anyway).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const verifyOnly = process.argv.includes('--verify-only')

if (process.platform !== 'darwin') {
  console.error('Mac apps can only be built and signed on a Mac (Apple\'s tools: codesign, notarytool, hdiutil). Run this in Terminal on your Mac.')
  process.exit(1)
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}

// --- What can we sign with? ---------------------------------------------------------
const identities = run('security', ['find-identity', '-v', '-p', 'codesigning']).out
const developerId = /"(Developer ID Application: [^"]+)"/.exec(identities)?.[1]
const env = process.env
const notarizeCreds = (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) || (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) || (env.APPLE_KEYCHAIN_PROFILE)
const mode = developerId ? (notarizeCreds ? 'notarized' : 'signed') : 'adhoc'

if (!verifyOnly) {
  console.log(`\nSound Visualizer ${pkg.version}: building a universal Mac app (Apple Silicon + Intel)`)
  console.log(
    {
      notarized: `Signing as ${developerId}, then notarizing with Apple. This takes a few minutes.`,
      signed: `Signing as ${developerId}. No notarization credentials set, so it won't be notarized (see RELEASING.md).`,
      adhoc: 'No Developer ID certificate found: making an ad-hoc signed test build (see RELEASING.md to sign it properly).'
    }[mode]
  )
  const step = (label, cmd, args) => {
    console.log(`\n> ${label}`)
    const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
    if (r.status !== 0) {
      console.error(`\n${label} failed.`)
      process.exit(r.status ?? 1)
    }
  }
  step('Checking types and running tests', 'npx', ['--no-install', 'tsc', '--noEmit'])
  step('Running tests', 'npx', ['--no-install', 'vitest', 'run'])
  step('Building the app', 'npx', ['--no-install', 'electron-vite', 'build'])
  const extra =
    mode === 'adhoc'
      ? ['-c.mac.identity=-', '-c.mac.notarize=false', '-c.mac.hardenedRuntime=false']
      : mode === 'signed'
        ? ['-c.mac.notarize=false']
        : []
  step('Packaging and signing', 'npx', ['--no-install', 'electron-builder', '--mac', '--universal', '--publish', 'never', ...extra])
}

// --- Apple's checks ------------------------------------------------------------------
const dist = join(root, 'dist')
const appDir = ['mac-universal', 'mac-arm64', 'mac'].map((d) => join(dist, d)).find((d) => existsSync(d))
const app = appDir && readdirSync(appDir).find((f) => f.endsWith('.app'))
const dmg = existsSync(dist) && readdirSync(dist).find((f) => f.endsWith('.dmg') && f.includes(pkg.version))
if (!app) {
  console.error('No built app in dist/. Run npm run dist:mac first.')
  process.exit(1)
}
const appPath = join(appDir, app)
const exe = join(appPath, 'Contents', 'MacOS', pkg.productName)
const results = []
const check = (name, ok, detail, required = true) => results.push({ name, ok, detail: detail.split('\n').filter(Boolean).slice(0, 3).join(' | '), required })

const archs = run('lipo', ['-archs', exe]).out
check('Runs on Apple Silicon and Intel (universal)', /arm64/.test(archs) && /x86_64/.test(archs), archs)
const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
check('Code signature is valid and complete', verify.ok, verify.out)
const info = run('codesign', ['-dv', '--verbose=4', appPath]).out
const authority = /Authority=(Developer ID Application[^\n]*)/.exec(info)?.[1]
check('Signed with a Developer ID', !!authority, authority ?? (/Signature=adhoc/.test(info) ? 'ad-hoc signature (testing only)' : 'not signed'), mode !== 'adhoc')
check('Hardened runtime is on', /flags=0x[0-9a-f]*\(.*runtime.*\)/.test(info), /flags=[^\n]*/.exec(info)?.[0] ?? '', mode !== 'adhoc')
const ents = run('codesign', ['-d', '--entitlements', '-', '--xml', appPath]).out
const risky = ['disable-library-validation', 'allow-dyld-environment-variables', 'get-task-allow', 'disable-executable-page-protection'].filter((e) => ents.includes(e))
check('No risky entitlements', risky.length === 0, risky.length ? risky.join(', ') : 'only allow-jit')
const plist = readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8')
check('Asks permission for the local network (Art-Net)', plist.includes('NSLocalNetworkUsageDescription'), 'NSLocalNetworkUsageDescription')
try {
  const { getCurrentFuseWire, FuseV1Options, FuseState } = await import('@electron/fuses')
  const wire = await getCurrentFuseWire(appPath)
  const is = (o, st) => wire[o] === st
  const ok = is(FuseV1Options.RunAsNode, FuseState.DISABLE) && is(FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE) && is(FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE) && is(FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE) && is(FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE)
  check('Electron fuses lock out code injection', ok, ok ? 'run-as-Node, NODE_OPTIONS and --inspect off; app.asar only, integrity checked' : JSON.stringify(wire))
} catch (error) {
  check('Electron fuses lock out code injection', false, String(error), false)
}
const gatekeeper = run('spctl', ['--assess', '--type', 'execute', '-vv', appPath])
check('Gatekeeper accepts the app', gatekeeper.ok, gatekeeper.out, mode === 'notarized')
if (dmg) {
  const staple = run('xcrun', ['stapler', 'validate', join(dist, dmg)])
  check('Notarization ticket stapled to the .dmg', staple.ok, staple.out, mode === 'notarized')
  const dmgGatekeeper = run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '-vv', join(dist, dmg)])
  check('Gatekeeper accepts the .dmg', dmgGatekeeper.ok, dmgGatekeeper.out, mode === 'notarized')
}

const line = (r) => `${r.ok ? 'PASS' : r.required ? 'FAIL' : 'note'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`
const report = [`Sound Visualizer ${pkg.version}: ${app}`, `Build: ${mode}`, '', ...results.map(line), ''].join('\n')
writeFileSync(join(dist, 'verification.txt'), report)
console.log(`\n${report}`)
const failed = results.filter((r) => r.required && !r.ok)
if (dmg) console.log(`Share this file: dist/${dmg}`)
if (mode !== 'notarized') console.log('This build is not notarized: other Macs will warn before opening it. See RELEASING.md.')
process.exit(failed.length ? 1 : 0)
