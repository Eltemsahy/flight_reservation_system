import React from 'react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { createPassenger, createReservation, getAvailableSeats, getPassengers } from '../services/API';

const FlightCard = ({ flight }) => {
  const [showBooking, setShowBooking] = React.useState(false);
  const [passengers, setPassengers] = React.useState([]);
  const [seats, setSeats] = React.useState([]);
  const [passengerId, setPassengerId] = React.useState('');
  const [seatNumber, setSeatNumber] = React.useState('');
  const [newPassenger, setNewPassenger] = React.useState({ name: '', email: '', phone_number: '', nationality: '' });
  const [bookingError, setBookingError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  if (!flight || !flight.id) {
    return (
      <div className="card h-100 shadow-sm">
        <div className="card-body text-danger">
          Invalid flight data
        </div>
      </div>
    );
  }

  const {
    airline = {},
    departure_airport = {},
    destination_airport = {},
    flight_number = 'N/A',
    available_seats = 'N/A'
  } = flight;

  let departureTime, arrivalTime, duration;
  try {
    departureTime = flight.departure_time ? new Date(flight.departure_time) : null;
    arrivalTime = flight.arrival_time ? new Date(flight.arrival_time) : null;
    if (departureTime && arrivalTime) {
      duration = intervalToDuration({ start: departureTime, end: arrivalTime });
    }
  } catch (e) {
    console.error('Date parsing error:', e);
  }
  const handleReserve = async () => {
    try {
      if (!localStorage.getItem('authToken')) {
        alert('Please log in to reserve.');
        return;
      }
      const [passengerResponse, seatResponse] = await Promise.all([
        getPassengers(),
        getAvailableSeats(flight.id),
      ]);
      setPassengers(passengerResponse.data);
      setSeats(seatResponse.data);
      setPassengerId(String(passengerResponse.data[0]?.id || ''));
      setSeatNumber(seatResponse.data[0]?.seat_number || '');
      setBookingError('');
      setShowBooking(true);
    } catch (err) {
      alert(`Could not prepare booking: ${err.message}`);
    }
  };

  const handleCreatePassenger = async (event) => {
    event.preventDefault();
    setSaving(true);
    setBookingError('');
    try {
      const { data } = await createPassenger(newPassenger);
      const createdPassenger = data[0];
      setPassengers((current) => [...current, createdPassenger]);
      setPassengerId(String(createdPassenger.id));
      setNewPassenger({ name: '', email: '', phone_number: '', nationality: '' });
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBookingSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setBookingError('');
    try {
      await createReservation({
        passenger_id: Number(passengerId),
        flight_id: flight.id,
        seat_number: seatNumber,
      });
      setShowBooking(false);
      alert('Reservation successful.');
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card h-100 shadow-sm">
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">
          {airline?.name || 'Unknown Airline'} - {flight_number}
        </h5>
      </div>
      <div className="card-body">
        <div className="d-flex justify-content-between mb-3">
          <div>
            <h6 className="text-muted">Departure</h6>
            <p className="mb-1">
              {departureTime ? format(departureTime, 'MMM d, yyyy h:mm a') : 'N/A'}
            </p>
            <p className="fw-bold">
              {departure_airport.code || 'N/A'} ({departure_airport.name || 'N/A'})
            </p>
          </div>
          
          <div className="text-center">
            <div className="flight-duration">
              {duration ? formatDuration(duration, { format: ['hours', 'minutes'] }) : 'N/A'}
            </div>
            <div className="flight-arrow">→</div>
          </div>
          
          <div className="text-end">
            <h6 className="text-muted">Arrival</h6>
            <p className="mb-1">
              {arrivalTime ? format(arrivalTime, 'MMM d, yyyy h:mm a') : 'N/A'}
            </p>
            <p className="fw-bold">
              {destination_airport.code || 'N/A'} ({destination_airport.name || 'N/A'})
            </p>
          </div>
        </div>
        
        <div className="d-flex justify-content-between align-items-center">
        <span className="badge bg-secondary">
          {available_seats !== 'N/A' ? `${available_seats} seats available` : 'N/A'}
        </span>
        <button className="btn btn-sm btn-primary" onClick={handleReserve}>
          Book Now
        </button>
        </div>
      </div>
      <Modal show={showBooking} onHide={() => setShowBooking(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Book {flight_number}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            {bookingError && <Alert variant="danger">{bookingError}</Alert>}
            {passengers.length > 0 ? (
              <Form.Group className="mb-3">
                <Form.Label>Passenger</Form.Label>
                <Form.Select value={passengerId} onChange={(event) => setPassengerId(event.target.value)} required>
                  {passengers.map((passenger) => (
                    <option key={passenger.id} value={passenger.id}>{passenger.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            ) : (
              <Alert variant="info">Create a passenger profile to continue with this booking.</Alert>
            )}
            {passengers.length === 0 && (
              <Form onSubmit={handleCreatePassenger}>
                {['name', 'email', 'phone_number', 'nationality'].map((field) => (
                  <Form.Group className="mb-3" key={field}>
                    <Form.Label>{field.replace('_', ' ')}</Form.Label>
                    <Form.Control
                      type={field === 'email' ? 'email' : 'text'}
                      value={newPassenger[field]}
                      onChange={(event) => setNewPassenger({ ...newPassenger, [field]: event.target.value })}
                      required
                    />
                  </Form.Group>
                ))}
                <Button type="submit" variant="outline-primary" disabled={saving}>Create passenger</Button>
              </Form>
            )}
            {seats.length === 0 ? (
              <Alert variant="warning" className="mt-3">No seats are currently available.</Alert>
            ) : (
              <Form.Group className="mb-3">
                <Form.Label>Available seat</Form.Label>
                <Form.Select value={seatNumber} onChange={(event) => setSeatNumber(event.target.value)} required>
                  {seats.map((seat) => (
                    <option key={seat.seat_number} value={seat.seat_number}>
                      {seat.seat_number} - {seat.class_type}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowBooking(false)}>Close</Button>
          <Button
            type="button"
            onClick={handleBookingSubmit}
            disabled={saving || !passengers.length || !seats.length}
          >
            {saving ? 'Booking...' : 'Confirm booking'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default FlightCard;