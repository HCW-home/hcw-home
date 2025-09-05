const axios = require('axios');

const BACKEND_URL = 'http://localhost:3000/api/v1';
const TIMEOUT = 5000; // 5 seconds timeout

// Configure axios with timeout
axios.defaults.timeout = TIMEOUT;

async function waitForServer(maxWaitTime = 60000) {
  console.log('⏳ Waiting for backend server to be ready...');
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      await axios.get(`${BACKEND_URL}/health`);
      console.log('✅ Backend server is ready!');
      return true;
    } catch (error) {
      console.log(`⏳ Server not ready yet... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  console.log('❌ Server failed to start within the timeout period');
  return false;
}

async function testBackendConnection() {
  console.log('🔍 Testing Patient Frontend to Backend Connection...\n');

  // Wait for server to be ready first
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.log('❌ Backend server is not responding. Please check if it started properly.');
    return;
  }

  // Test 1: Health Check
  try {
    console.log('\n1. Testing Health Check Endpoint...');
    const healthResponse = await axios.get(`${BACKEND_URL}/health`);
    console.log('✅ Health Check:', healthResponse.data);
  } catch (error) {
    console.log('❌ Health Check Failed:', error.response?.data || error.message);
  }

  // Test 2: Auth Endpoints
  try {
    console.log('\n2. Testing Auth Request Magic Link Endpoint...');
    const authResponse = await axios.post(`${BACKEND_URL}/auth/request-magic-link`, {
      contact: '+1234567890',
      type: 'phone'
    });
    console.log('✅ Auth Magic Link:', authResponse.data);
  } catch (error) {
    console.log('❌ Auth Magic Link Failed:', error.response?.data || error.message);
  }

  // Test 3: Consultation Endpoints (without auth - should get 401)
  try {
    console.log('\n3. Testing Consultation History Endpoint (should be protected)...');
    const consultationResponse = await axios.get(`${BACKEND_URL}/consultation/patient/history`, {
      params: { patientId: 1 }
    });
    console.log('✅ Consultation History:', consultationResponse.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Consultation History properly protected (401 Unauthorized)');
    } else {
      console.log('❌ Consultation History Failed:', error.response?.data || error.message);
    }
  }

  // Test 4: WebSocket Connection Test
  console.log('\n4. Testing WebSocket Connection Availability...');
  try {
    const socketResponse = await axios.get('http://localhost:3000/socket.io/?transport=polling');
    console.log('✅ Socket.IO endpoint accessible');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Socket.IO endpoint responding (400 is expected without proper handshake)');
    } else {
      console.log('❌ Socket.IO endpoint failed:', error.response?.data || error.message);
    }
  }

  // Test 5: Language/Speciality endpoints
  try {
    console.log('\n5. Testing Language Endpoint...');
    const langResponse = await axios.get(`${BACKEND_URL}/language`);
    console.log('✅ Language Endpoint:', langResponse.data);
  } catch (error) {
    console.log('❌ Language Endpoint Failed:', error.response?.data || error.message);
  }

  try {
    console.log('\n6. Testing Speciality Endpoint...');
    const specResponse = await axios.get(`${BACKEND_URL}/speciality`);
    console.log('✅ Speciality Endpoint:', specResponse.data);
  } catch (error) {
    console.log('❌ Speciality Endpoint Failed:', error.response?.data || error.message);
  }

  console.log('\n✨ Connection tests completed!');
}

// Run the test
testBackendConnection().catch(console.error);
