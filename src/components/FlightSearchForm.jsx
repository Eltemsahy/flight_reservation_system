import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import flatpickr from 'flatpickr';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'flatpickr/dist/flatpickr.min.css';
import { useNavigate } from 'react-router-dom';
import { getAirports } from '../services/API';

const FlightSearchForm = () => {
  const [searchParams, setSearchParams] = useState({
    departure_code: '',
    destination_code: '',
    departure_date: '',
    travellers: 1,
    class_type: 'economy'
  });
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Fetch airports with country information
  useEffect(() => {
    const fetchAirports = async () => {
      try {
        const response = await getAirports();
        setAirports(response.data);
      } catch (error) {
        console.error('Error fetching airports:', error);
      }
    };
    fetchAirports();

    // Initialize date picker (single date mode)
    const datePicker = flatpickr("#DatePicker", {
      dateFormat: "Y-m-d",
      locale: "en",
      onChange: (selectedDates) => {
        if (selectedDates.length === 1) {
          setSearchParams(prev => ({
            ...prev,
            departure_date: selectedDates[0].toISOString().split('T')[0]
          }));
        }
      }
    });

    return () => {
      datePicker.destroy();
    };
  }, []);

  const handleSwap = () => {
    setSearchParams(prev => ({
      ...prev,
      departure_code: prev.destination_code,
      destination_code: prev.departure_code
    }));
  };

  const handleSelectAirport = (type, code) => {
    setSearchParams(prev => ({
      ...prev,
      [type === 'from' ? 'departure_code' : 'destination_code']: code
    }));
  };

  const handleSelectClass = (classType) => {
    setSearchParams(prev => ({
      ...prev,
      class_type: classType.toLowerCase()
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    // Build query string
    const params = [];
    if (searchParams.departure_code) params.push(`departure_code=${encodeURIComponent(searchParams.departure_code)}`);
    if (searchParams.destination_code) params.push(`destination_code=${encodeURIComponent(searchParams.destination_code)}`);
    if (searchParams.departure_date) params.push(`departure_date=${encodeURIComponent(searchParams.departure_date)}`);

    const queryString = params.length ? `?${params.join('&')}` : '';
    navigate(`/flights${queryString}`);
    setLoading(false);
  };

  const getSelectedAirportName = (code, isDeparture = true) => {
    if (!code) return isDeparture ? 'From?' : 'To?';
    const airport = airports.find(a => a.code === code);
    return airport ? `${airport.code} (${airport.country?.code || ''})` : code;
  };

  return (
    <form className="d-flex flightSearchForm" role="search" onSubmit={handleSubmit}>
      {/* Departure Airport Dropdown */}
      <div className="dropdown">
        <Dropdown>
        <Dropdown.Toggle 
          className='form-control me-2 btn no-arrow glass-button from-to' 
          id="from-dropdown" 
          type='button'
        >
          {getSelectedAirportName(searchParams.departure_code, true)}
        </Dropdown.Toggle>
          <Dropdown.Menu className="dropdown-menu-scrollable">
            {airports.map(airport => (
              <Dropdown.Item 
                key={airport.code}
                onClick={() => handleSelectAirport('from', airport.code)}
              >
                <div className="d-flex justify-content-between">
                  <span>
                    <strong>{airport.code}</strong> - {airport.name}
                  </span>
                  <span className="text-muted">
                    {airport.country?.name || airport.country_code}
                  </span>
                </div>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* Swap Button */}
      <div className="switchFromTo">
        <button 
          type="button" 
          className='form-control glass-button btn'
          onClick={handleSwap}
        >
          <i className="bi bi-arrow-left-right"></i>
        </button>
      </div>

      {/* Destination Airport Dropdown */}
      <div className="dropdown">
        <Dropdown>
        <Dropdown.Toggle 
          className='form-control me-2 btn no-arrow glass-button from-to' 
          id="to-dropdown" 
          type='button'
        >
          {getSelectedAirportName(searchParams.destination_code, false)}
        </Dropdown.Toggle>
          <Dropdown.Menu className="dropdown-menu-scrollable">
            {airports.map(airport => (
              <Dropdown.Item 
                key={airport.code}
                onClick={() => handleSelectAirport('to', airport.code)}
              >
                <div className="d-flex justify-content-between">
                  <span>
                    <strong>{airport.code}</strong> - {airport.name}
                  </span>
                  <span className="text-muted">
                    {airport.country?.name || airport.country_code}
                  </span>
                </div>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* Date Picker (Single Date) */}
      <div className="departureAndReturn">
        <input
          className="form-control me-2 glass-button btn"
          type="date"
          id="DatePicker"
          placeholder="Departure Date"
          value={searchParams.departure_date}
          onChange={e => setSearchParams(prev => ({
            ...prev,
            departure_date: e.target.value
          }))}
        />
      </div>

      {/* Travellers & Class Dropdown */}
      <div className="dropdown">
      <Dropdown>
        <Dropdown.Toggle 
          className='form-control me-2 btn no-arrow glass-button' 
          id="class-dropdown" 
          type='button'
        >
          {searchParams.class_type.charAt(0).toUpperCase() + searchParams.class_type.slice(1)} Class
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.ItemText>Select Class</Dropdown.ItemText>
          <Dropdown.Item onClick={() => handleSelectClass('economy')}>
            <div className="d-flex justify-content-between align-items-center">
              <span>Economy Class</span>
              {searchParams.class_type === 'economy' && <i className="bi bi-check"></i>}
            </div>
          </Dropdown.Item>
          <Dropdown.Item onClick={() => handleSelectClass('business')}>
            <div className="d-flex justify-content-between align-items-center">
              <span>Business Class</span>
              {searchParams.class_type === 'business' && <i className="bi bi-check"></i>}
            </div>
          </Dropdown.Item>
          <Dropdown.Item onClick={() => handleSelectClass('first')}>
            <div className="d-flex justify-content-between align-items-center">
              <span>First Class</span>
              {searchParams.class_type === 'first' && <i className="bi bi-check"></i>}
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
      </div>

      {/* Search Button */}
      <div className="searchFlight">
        <button 
          className="btn btn-primary" 
          type="submit" 
          style={{boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)'}}
          disabled={loading || !searchParams.departure_code || !searchParams.destination_code || !searchParams.departure_date}
        >
          {loading ? (
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          ) : (
            <i className="bi bi-search"></i>
          )}
        </button>
      </div>
    </form>
  );
};

export default FlightSearchForm;