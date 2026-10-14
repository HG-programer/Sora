// scripts/generate-keystore.js
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

const KEYSTORE_PATH = path.resolve(__dirname, '../android/app/sora-release-key.jks');

console.log('🔑 Generating 2048-bit RSA keypair for Sora release keystore...');
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log('📜 Generating self-signed X.509 certificate...');
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(15));
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 28); // 28 years

const attrs = [
  { name: 'commonName', value: 'Sora Mobile' },
  { name: 'countryName', value: 'JP' },
  { shortName: 'ST', value: 'Tokyo' },
  { name: 'localityName', value: 'Tokyo' },
  { name: 'organizationName', value: 'Sora' },
  { shortName: 'OU', value: 'Release' }
];

cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('📦 Packaging PKCS#12 keystore (alias: sora)...');
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [cert],
  'sora123',
  {
    algorithm: '3des',
    friendlyName: 'sora',
    generateLocalKeyId: true
  }
);

const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
fs.writeFileSync(KEYSTORE_PATH, Buffer.from(p12Der, 'binary'));

console.log(`✅ Keystore generated successfully: ${KEYSTORE_PATH} (${fs.statSync(KEYSTORE_PATH).size} bytes)`);
