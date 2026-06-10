import javax.swing.*;

public class TestApp {
    public static void main(String[] args) {
        JFrame frame = new JFrame("Hello Swing");
        frame.setSize(300, 200);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        JLabel label = new JLabel("Web Java Local GUI!", SwingConstants.CENTER);
        frame.add(label);
        frame.setVisible(true);
        System.out.println("GUI launched successfully.");
    }
}