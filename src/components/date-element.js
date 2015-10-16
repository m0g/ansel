import React from 'react';

class DateElement extends React.Component {

  constructor(props) {
    super(props);

    this.isActive.bind(this);
  }

  handleClick() {
    this.props.setDate(this.props.date);
  }

  isActive(date) {
    return (date == this.props.currentDate) ? 'active' : '';
  }

  render() {
    return (
      <li className={this.isActive(this.props.date)}>
        <button onClick={this.handleClick.bind(this)} className="mdl-button mdl-js-button">
          <i className="fa fa-calendar-o"></i> {this.props.date}
        </button>
      </li>
    )
  }
}

export default DateElement;