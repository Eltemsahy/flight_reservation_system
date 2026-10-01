import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import FlightCard from '../components/FlightCard';
import Navbar from '../components/Navbar';
import { getFlights } from '../services/API';

const Flights = () => {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const [showAll, setShowAll] = useState(false);

  const fetchFlights = async (controller) => {
    try {
      setLoading(true);
      setError(null);

      // Extract params from URL
      const filters = {};
      if (!showAll) {
        for (const field of ['departure_code', 'destination_code', 'departure_date']) {
          const value = searchParams.get(field);
          if (value) filters[field] = `eq.${value}`;
        }
      }

      const response = await getFlights(filters, controller?.signal);
      setFlights(response.data);
    } catch (err) {
      if (err.name === 'CanceledError') {
        return;
      }
      setError(err.message || 'Failed to fetch flights');
      setFlights([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchFlights(controller);
    return () => controller.abort();
  }, [searchParams, showAll]);

  const retry = () => fetchFlights();

  return (
    <>
      <Navbar />
      <div className="container py-4">
        <div className="d-flex justify-content-between mb-4">
          <h2>{showAll ? "All Flights" : "Search Results"}</h2>
          <button 
            className="btn btn-outline-primary" 
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show Search Results" : "Show All Flights"}
          </button>
        </div>

        {error && (
          <div className="alert alert-danger">
            <strong>Error:</strong> {error}
            <button 
              className="btn btn-sm btn-danger mt-2" 
              onClick={retry}
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2">Fetching flight data...</p>
          </div>
        ) : flights.length === 0 ? (
          <div className="alert alert-warning">
            {showAll ? "No flights found." : "No matching flights. Try different search criteria."}
          </div>
        ) : (
          <div className="row g-4">
            {flights.map((flight, index) => (
              <div key={flight.id || index} className="col-md-6 col-lg-4">
                <FlightCard flight={flight} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Flights;