// AdminPanel.jsx
import React, { useState, useEffect } from 'react';
import { Tab, Tabs, Table, Button, Modal, Form, Alert } from 'react-bootstrap';
import { api } from '../services/API';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from '../components/Navbar';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('countries');
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({});
  const [formData, setFormData] = useState({});
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const entityConfig = {
    countries: {
      fields: ['code', 'name', 'continent', 'official_language', 'is_schengen_zone_member'],
      required: ['code', 'name'],
      endpoint: '/countries'
    },
    airports: {
      fields: ['code', 'name', 'location', 'country_code', 'number_of_terminals'],
      required: ['code', 'name', 'country_code'],
      endpoint: '/airports'
    },
    airlines: {
      fields: ['name', 'iata_code', 'icao_code', 'headquarters', 'year_founded', 'base_airport_code'],
      required: ['name', 'iata_code', 'icao_code', 'base_airport_code'],
      endpoint: '/airlines'
    },
    flights: {
      fields: ['flight_number', 'departure_code', 'destination_code', 'departure_time', 
               'arrival_time', 'total_seats', 'gate', 'terminal', 'airline_id', 'days_of_operation'],
      required: ['flight_number', 'departure_code', 'destination_code', 'departure_time', 'arrival_time'],
      endpoint: '/flights'
    },
    passengers: {
      fields: ['name', 'national_id', 'email', 'phone_number', 'nationality', 'is_vip', 
               'address', 'date_of_birth', 'passport_number', 'gender', 'frequent_flyer_number'],
      required: ['name', 'national_id', 'email', 'phone_number', 'nationality'],
      endpoint: '/passengers'
    },
    promotions: {
      fields: ['promo_id', 'description', 'discount_percentage', 'start_date', 'end_date', 
               'promo_code', 'min_purchase', 'max_discount', 'usage_limit'],
      required: ['promo_id', 'description', 'discount_percentage', 'start_date', 'end_date'],
      endpoint: '/promotions'
    },
    users: {
      fields: ['username', 'email', 'role', 'is_active'],
      required: ['username', 'email'],
      endpoint: '/users'
    }
  };

  useEffect(() => {
    if (activeTab !== 'users') {
      setSearchTerm('');
    }
    fetchItems();
  }, [activeTab, searchTerm]);

  const fetchItems = async () => {
    try {
      const params = activeTab === 'users' && searchTerm
        ? { or: `(username.ilike.*${searchTerm}*,email.ilike.*${searchTerm}*)`, limit: 100 }
        : {};
      const response = await api.get(entityConfig[activeTab].endpoint, { params });
      setItems(response.data);
    } catch (err) {
      setError(`Failed to fetch ${activeTab}: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let newValue = value;
    if (type === 'checkbox') {
      newValue = checked;
    }
    // Convert datetime-local to ISO string with seconds
    else if (type === 'datetime-local' && value) {
      // value is "YYYY-MM-DDTHH:mm"
      newValue = value.length === 16 ? value + ':00' : value;
    }
    setFormData({
      ...formData,
      [name]: newValue
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Remove empty fields and convert types as needed
    const config = entityConfig[activeTab];
    const dataToSend = {};
    config.fields.forEach(field => {
      if (formData[field] !== undefined && formData[field] !== '') {
        let value = formData[field];
        
        // Type conversion based on entity and field
        if (activeTab === 'flights') {
          if (['total_seats', 'airline_id', 'days_of_operation'].includes(field)) {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              setError(`Invalid number for ${field}`);
              return;
            }
          }
        } else if (activeTab === 'airports') {
          if (field === 'number_of_terminals') {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              setError(`Invalid number for ${field}`);
              return;
            }
          }
        } else if (activeTab === 'airlines') {
          if (field === 'year_founded') {
            value = parseInt(value, 10);
            if (isNaN(value)) {
              setError(`Invalid number for ${field}`);
              return;
            }
          }
        } else if (activeTab === 'promotions') {
          if (['discount_percentage', 'min_purchase', 'max_discount', 'usage_limit'].includes(field)) {
            value = parseFloat(value);
            if (isNaN(value)) {
              setError(`Invalid number for ${field}`);
              return;
            }
          }
        } else if (activeTab === 'passengers') {
          if (field === 'is_vip') {
            value = Boolean(value);
          }
        } else if (activeTab === 'countries') {
          if (field === 'is_schengen_zone_member') {
            value = Boolean(value);
          }
        }
        
        // Convert string "true"/"false" to boolean for checkboxes
        if (typeof value === 'string' && (value === 'true' || value === 'false')) {
          value = value === 'true';
        }
        
        dataToSend[field] = value;
      }
    });
    try {
      // Use correct identifier for PUT/DELETE
      const identifierField = activeTab === 'countries' || activeTab === 'airports'
        ? 'code'
        : activeTab === 'promotions'
          ? 'promo_id'
          : 'id';
      const identifier = modalData[identifierField];
      if (activeTab === 'users' && !identifier) {
        await api.post('/rpc/admin_create_user', {
          username: dataToSend.username,
          email: dataToSend.email,
          password: formData.password,
          role: dataToSend.role || 'User',
        });
        setSuccess('User created successfully');
      } else if (identifier) {
        if (activeTab === 'users') delete dataToSend.password;
        await api.patch(entityConfig[activeTab].endpoint, dataToSend, {
          params: { [identifierField]: `eq.${identifier}` },
        });
        setSuccess(`${activeTab.slice(0, -1)} updated successfully`);
      } else {
        await api.post(entityConfig[activeTab].endpoint, dataToSend, {
          headers: { Prefer: 'return=representation' },
        });
        setSuccess(`${activeTab.slice(0, -1)} created successfully`);
      }
      fetchItems();
      setShowModal(false);
    } catch (err) {
        setError(`Operation failed: ${err.response?.data?.message || err.response?.data?.details || err.message}`);
      }
  };
  


  const handleEdit = (item) => {
    setModalData(item);
    setFormData(item);
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const identifierField = activeTab === 'countries' || activeTab === 'airports'
          ? 'code'
          : activeTab === 'promotions'
            ? 'promo_id'
            : 'id';
        await api.delete(entityConfig[activeTab].endpoint, {
          params: { [identifierField]: `eq.${item[identifierField]}` },
        });
        setSuccess(`${activeTab.slice(0, -1)} deleted successfully`);
        fetchItems();
      } catch (err) {
        setError(`Delete failed: ${err.response?.data?.detail || err.message}`);
      }
    }
  };

  const handleAddNew = () => {
    setModalData({});
    setFormData({});
    setShowModal(true);
  };

  const renderTable = () => {
    if (!items.length) return <p>No {activeTab} found</p>;

    return (
      <Table striped bordered hover>
        <thead>
          <tr>
            {activeTab === 'airlines' && <th>ID</th>}
            {entityConfig[activeTab].fields.map(field => (
              <th key={field}>{field.replace('_', ' ')}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id || item.code || item.promo_id}>
              {activeTab === 'airlines' && <td>{item.id}</td>}
              {entityConfig[activeTab].fields.map(field => (
                <td key={field}>
                  {typeof item[field] === 'boolean' ? 
                    (item[field] ? 'Yes' : 'No') : 
                    (field.endsWith('_time') || field.endsWith('_date')) ? 
                    new Date(item[field]).toLocaleString() : 
                    item[field]}
                </td>
              ))}
              <td>
                <Button variant="primary" size="sm" onClick={() => handleEdit(item)}>
                  Edit
                </Button>{' '}
                <Button variant="danger" size="sm" onClick={() => handleDelete(item)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  const renderModal = () => {
    const config = entityConfig[activeTab];
    
    return (
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{modalData.id ? 'Edit' : 'Add New'} {activeTab.slice(0, -1)}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            {config.fields.map(field => (
              <Form.Group key={field} className="mb-3">
                <Form.Label>
                  {field.replace('_', ' ')}
                  {config.required.includes(field) && <span className="text-danger">*</span>}
                </Form.Label>
                {field === 'is_schengen_zone_member' || field === 'is_vip' || field === 'is_active' ? (
                  <Form.Check
                    type="checkbox"
                    name={field}
                    checked={Boolean(formData[field])}
                    onChange={handleInputChange}
                  />
                ) : field === 'role' ? (
                  <Form.Select
                    name="role"
                    value={formData.role || 'User'}
                    onChange={handleInputChange}
                    required={config.required.includes(field)}
                  >
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </Form.Select>
                ) : field === 'password' ? (
                  <Form.Control
                    type="password"
                    name="password"
                    value={formData[field] || ''}
                    onChange={handleInputChange}
                    required={!modalData.id && config.required.includes(field)}
                  />
                ) : field.endsWith('_time') || field.endsWith('_date') ? (
                  <Form.Control
                    type="datetime-local"
                    name={field}
                    value={formData[field] ? new Date(formData[field]).toISOString().slice(0, 16) : ''}
                    onChange={handleInputChange}
                    required={config.required.includes(field)}
                  />
                ) : (
                  <Form.Control
                    type="text"
                    name={field}
                    value={formData[field] || ''}
                    onChange={handleInputChange}
                    required={config.required.includes(field)}
                  />
                )}
              </Form.Group>
            ))}
            {activeTab === 'users' && !modalData.id && (
              <Form.Group className="mb-3">
                <Form.Label>Password <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="password"
                  name="password"
                  value={formData.password || ''}
                  onChange={handleInputChange}
                  minLength={8}
                  required
                />
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Close
            </Button>
            <Button variant="primary" type="submit">
              Save Changes
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    );
  };

  return (
    <div className="container mt-4">
      <Navbar />
      <h2>Admin Panel</h2>
      
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-3"
      >
        <Tab eventKey="countries" title="Countries">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Country
          </Button>
          {renderTable()}
        </Tab>
        <Tab eventKey="airports" title="Airports">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Airport
          </Button>
          {renderTable()}
        </Tab>
        <Tab eventKey="airlines" title="Airlines">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Airline
          </Button>
          {renderTable()}
        </Tab>
        <Tab eventKey="flights" title="Flights">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Flight
          </Button>
          {renderTable()}
        </Tab>
        <Tab eventKey="passengers" title="Passengers">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Passenger
          </Button>
          {renderTable()}
        </Tab>
        <Tab eventKey="users" title="Users">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add User
          </Button>
          <Form.Group className="mb-3" controlId="userSearch">
            <Form.Label>Search users</Form.Label>
            <Form.Control
              type="text"
              placeholder="Search by username or email"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Form.Group>
          {renderTable()}
        </Tab>
        <Tab eventKey="promotions" title="Promotions">
          <Button variant="success" onClick={handleAddNew} className="mb-3">
            Add Promotion
          </Button>
          {renderTable()}
        </Tab>
      </Tabs>

      {renderModal()}
    </div>
  );
};

export default AdminPanel;