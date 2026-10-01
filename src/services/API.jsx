import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3000',
  headers: {
    'Accept-Profile': 'api',
    'Content-Profile': 'api',
  },
});

// JWT Auth Interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export { api };

// Helper: Standardize errors
const handleError = (error) => {
  if (axios.isCancel(error)) throw error;
  const message = error.response?.data?.message
    || error.response?.data?.details
    || error.response?.data?.detail
    || error.message;
  throw new Error(message);
};

// Auth
export const registerUser = (userData) => 
  api.post('/rpc/register', userData).catch(handleError);

export const loginUser = async (username, password) => {
  try {
    const response = await api.post('/rpc/login', { username, password });
    localStorage.setItem('authToken', response.data.access_token);
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

export const logoutUser = () => {
  localStorage.removeItem('authToken');
};

// Flights
export const getFlights = (params = {}, signal) =>
  api.get('/flight_details', { params, signal }).catch(handleError);
export const createFlight = (flightData) => 
  api.post('/flights', flightData, { headers: { Prefer: 'return=representation' } }).catch(handleError);
export const deleteFlight = (flightId) => 
  api.delete('/flights', { params: { id: `eq.${flightId}` } }).catch(handleError);

export const getAirports = () =>
  api.get('/airports', { params: { select: '*,country:countries(*)', order: 'name.asc' } }).catch(handleError);

export const getPassengers = () =>
  api.get('/passengers', { params: { select: 'id,name', order: 'name.asc' } }).catch(handleError);

export const createPassenger = (passenger) =>
  api.post('/passengers', passenger, { headers: { Prefer: 'return=representation' } }).catch(handleError);

export const getAvailableSeats = (flightId) =>
  api.get('/seats', {
    params: {
      select: 'seat_number,class_type',
      flight_id: `eq.${flightId}`,
      is_available: 'eq.true',
      order: 'seat_number.asc',
    },
  }).catch(handleError);

export const createReservation = (reservation) =>
  api.post('/rpc/create_reservation', reservation).catch(handleError);

export const getMyFlights = () => api.get('/rpc/my_flights').catch(handleError);

export const cancelReservation = (reservationId) =>
  api.post('/rpc/cancel_reservation', { reservation_id: reservationId }).catch(handleError);

// User
export const getUserProfile = () => 
  api.get('/rpc/me').catch(handleError);

// Auth Check
export const checkAuth = async () => {
  if (!localStorage.getItem('authToken')) return false;
  try {
    await getUserProfile(); // Test token validity
    return true;
  } catch {
    return false;
  }
};