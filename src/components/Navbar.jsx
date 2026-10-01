import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { Dropdown, Offcanvas, Button, Modal, Alert, Tabs, Tab, Form } from 'react-bootstrap';
import * as formik from 'formik';
import * as yup from 'yup';
import { loginUser, registerUser, getUserProfile, logoutUser } from '../services/API';

const Navbar = () => {
  // State management
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [authError, setAuthError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // Form validation schemas
  const { Formik } = formik;

  const loginSchema = yup.object().shape({
    username: yup.string().required('Username is required'),
    password: yup.string().required('Password is required')
  });

  const registerSchema = yup.object().shape({
    username: yup.string()
      .required('Username is required')
      .min(3, 'Username must be at least 3 characters')
      .max(50, 'Username must be at most 50 characters'),
    email: yup.string()
      .email('Invalid email format')
      .required('Email is required'),
    password: yup.string()
      .required('Password is required')
      .min(8, 'Password must be at least 8 characters')
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase, lowercase, and number'
      ),
    confirmPassword: yup.string()
      .oneOf([yup.ref('password'), null], 'Passwords must match')
      .required('Please confirm your password')
  });

  useEffect(() => {
    if (!localStorage.getItem('authToken')) return;
    getUserProfile()
      .then(({ data }) => {
        setIsLoggedIn(true);
        setCurrentUser(data.username);
      })
      .catch(() => logoutUser());
  }, []);

  const handleLogin = async (values, { setSubmitting }) => {
    try {
      const response = await loginUser(values.username, values.password);
      setIsLoggedIn(true);
      setCurrentUser(response.username);
      setShowAuthModal(false);
    } catch (error) {
      setAuthError(error.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (values, { setSubmitting }) => {
    try {
      await registerUser({
        username: values.username,
        email: values.email,
        password: values.password
      });
      const response = await loginUser(values.username, values.password);
      setIsLoggedIn(true);
      setCurrentUser(response.username);
      setShowAuthModal(false);
    } catch (error) {
      setAuthError(error.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    logoutUser();
  };

  const handleOffcanvasClose = () => setShowOffcanvas(false);
  const handleOffcanvasShow = () => setShowOffcanvas(true);

  return (
    <nav className="navbar sticky-top">
      <div className="container-fluid">
        <div className="d-flex align-items-center">
          <button
            className="navbar-toggler"
            type="button"
            onClick={handleOffcanvasShow}
            aria-controls="offcanvasNavbar"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <a className="navbar-brand ms-2" href="#" style={{ color: '#007bff' }}>
            EgyFly&trade;
          </a>
        </div>
        
        <Offcanvas show={showOffcanvas} onHide={handleOffcanvasClose}>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>EgyFly&trade;</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            {/* <p className="nav-item">
              <a className="nav-link active" aria-current="page" href="#">Explore Trips <i className="bi bi-luggage-fill"></i></a>
            </p>
            <p className="nav-item">
              <a className="nav-link active" href="#">All Flights <i className="bi bi-airplane-fill"></i></a>
            </p> */}
            <p className="nav-item">
              <Link className="nav-link active" to="/reserved-flights">
                Reserved Flights
              </Link>
            </p>
            <p className="nav-item">
              <Link className="nav-link active" to="/flights">
                Flights
              </Link>
            </p>
            <p className="nav-item">
              <Link className="nav-link active" to="/adminPanel">
                Admin Panel
              </Link>
            </p>
          </Offcanvas.Body>
        </Offcanvas>

        <div className="d-flex">
          <button className="btn btn-outline-danger me-2" type="button">
            <i className="bi bi-heart"></i>
          </button>
          
          {isLoggedIn ? (
            <Dropdown>
              <Dropdown.Toggle variant="outline-primary" id="dropdown-user">
                <i className="bi bi-person-circle"></i> {currentUser}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="#">Profile</Dropdown.Item>
                <Dropdown.Item href="#">My Flights</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout}>Logout</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          ) : (
            <Button 
              onClick={() => {
                setShowAuthModal(true);
                setActiveTab('login');
              }} 
              variant="outline-primary" 
              type="button"
            >
              <i className="bi bi-person-circle"></i> Sign In
            </Button>
          )}
        </div>

        {/* Auth Modal */}
        <Modal show={showAuthModal} onHide={() => setShowAuthModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{activeTab === 'login' ? 'Sign In' : 'Register'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {authError && <Alert variant="danger" onClose={() => setAuthError(null)} dismissible>{authError}</Alert>}
            
            <Tabs
              activeKey={activeTab}
              onSelect={(k) => {
                setActiveTab(k);
                setAuthError(null);
              }}
              className="mb-3"
            >
              <Tab eventKey="login" title="Sign In">
                <Formik
                  validationSchema={loginSchema}
                  onSubmit={handleLogin}
                  initialValues={{ username: '', password: '' }}
                >
                  {({ handleSubmit, handleChange, values, touched, errors, isSubmitting }) => (
                    <Form noValidate onSubmit={handleSubmit}>
                      <Form.Group className="mb-3">
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Enter username"
                          name="username"
                          value={values.username}
                          onChange={handleChange}
                          isInvalid={touched.username && !!errors.username}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.username}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <Form.Group className="mb-3">
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                          type="password"
                          placeholder="Password"
                          name="password"
                          value={values.password}
                          onChange={handleChange}
                          isInvalid={touched.password && !!errors.password}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.password}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <div className="d-grid">
                        <Button variant="primary" type="submit" disabled={isSubmitting}>
                          {isSubmitting ? 'Signing In...' : 'Sign In'}
                        </Button>
                      </div>
                    </Form>
                  )}
                </Formik>
              </Tab>
              
              <Tab eventKey="register" title="Register">
                <Formik
                  validationSchema={registerSchema}
                  onSubmit={handleRegister}
                  initialValues={{ 
                    username: '', 
                    email: '', 
                    password: '', 
                    confirmPassword: '' 
                  }}
                >
                  {({ handleSubmit, handleChange, values, touched, errors, isSubmitting }) => (
                    <Form noValidate onSubmit={handleSubmit}>
                      <Form.Group className="mb-3">
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="Choose a username"
                          name="username"
                          value={values.username}
                          onChange={handleChange}
                          isInvalid={touched.username && !!errors.username}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.username}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                          type="email"
                          placeholder="Enter email"
                          name="email"
                          value={values.email}
                          onChange={handleChange}
                          isInvalid={touched.email && !!errors.email}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.email}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <Form.Group className="mb-3">
                        <Form.Label>Password</Form.Label>
                        <Form.Control
                          type="password"
                          placeholder="Password"
                          name="password"
                          value={values.password}
                          onChange={handleChange}
                          isInvalid={touched.password && !!errors.password}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.password}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <Form.Group className="mb-3">
                        <Form.Label>Confirm Password</Form.Label>
                        <Form.Control
                          type="password"
                          placeholder="Confirm password"
                          name="confirmPassword"
                          value={values.confirmPassword}
                          onChange={handleChange}
                          isInvalid={touched.confirmPassword && !!errors.confirmPassword}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.confirmPassword}
                        </Form.Control.Feedback>
                      </Form.Group>
                      
                      <div className="d-grid">
                        <Button variant="success" type="submit" disabled={isSubmitting}>
                          {isSubmitting ? 'Registering...' : 'Register'}
                        </Button>
                      </div>
                    </Form>
                  )}
                </Formik>
              </Tab>
            </Tabs>
          </Modal.Body>
          <Modal.Footer className="justify-content-center">
            {activeTab === 'login' ? (
              <p className="text-muted">
                Don't have an account?{' '}
                <Button variant="link" onClick={() => setActiveTab('register')}>
                  Register here
                </Button>
              </p>
            ) : (
              <p className="text-muted">
                Already have an account?{' '}
                <Button variant="link" onClick={() => setActiveTab('login')}>
                  Sign in
                </Button>
              </p>
            )}
          </Modal.Footer>
        </Modal>
      </div>
    </nav>
  );
};

export default Navbar;