import * as React from 'react';
import MainLayout from '../components/mainlayout';
import { StaticImage } from "gatsby-plugin-image";

const IndexPage = () => {
  return (
    <MainLayout pageTitle="Home Page">
      <p>Welcome to the MaxHome.</p>
      <StaticImage alt="All in one" src="../images/allinone.jpg" />
      <p>Welcome to the MaxHome.</p>
    </MainLayout>
  );
};

export default IndexPage;
