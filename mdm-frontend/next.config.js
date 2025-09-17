/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT || 'http://localhost:80',
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID || 'mdm-project',
  },
}

module.exports = nextConfig
