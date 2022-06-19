import React, { Component } from 'react'
import { Row, Col, Container } from 'reactstrap'
import '../../stoc.css'
import NavBar from '../../../../../components/layout/Navbar'
class Exchange extends Component {
  render() {
    return (
      <Container className="root-page">
        <Row>
          <Col xl={3} className="d-none d-xl-block col-xl-38">
            <NavBar />
          </Col>
          <Col xl={9}></Col>
        </Row>
      </Container>
    )
  }
}

export default Exchange
